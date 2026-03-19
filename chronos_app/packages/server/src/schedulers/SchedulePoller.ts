import { DataSource, LessThanOrEqual } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { parseExpression } from 'cron-parser'
import { executeFlow } from '../utils/buildAgentflow'
import { IComponentNodes, IExecuteFlowParams, ExecutionState } from '../Interface'
import { Telemetry } from '../utils/telemetry'
import { CachePool } from '../CachePool'
import { UsageCacheManager } from '../UsageCacheManager'
import { Schedule } from '../database/entities/Schedule'
import { Execution } from '../database/entities/Execution'
import { AgentFlow } from '../database/entities/AgentFlow'
import { SSEStreamer } from '../utils/SSEStreamer'
import logger from '../utils/logger'

const DEFAULT_POLL_INTERVAL_MS = 10000

interface SchedulePollerOptions {
    appDataSource: DataSource
    componentNodes: IComponentNodes
    telemetry: Telemetry
    cachePool: CachePool
    usageCacheManager: UsageCacheManager
}

export class SchedulePoller {
    private appDataSource: DataSource
    private componentNodes: IComponentNodes
    private telemetry: Telemetry
    private cachePool: CachePool
    private usageCacheManager: UsageCacheManager
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: SchedulePollerOptions) {
        this.appDataSource = options.appDataSource
        this.componentNodes = options.componentNodes
        this.telemetry = options.telemetry
        this.cachePool = options.cachePool
        this.usageCacheManager = options.usageCacheManager
    }

    public start(): void {
        if (this.intervalId) return

        const pollIntervalMs = process.env.SCHEDULE_POLL_INTERVAL_MS
            ? parseInt(process.env.SCHEDULE_POLL_INTERVAL_MS, 10)
            : DEFAULT_POLL_INTERVAL_MS

        logger.info(`📅 [SchedulePoller] Starting with ${pollIntervalMs}ms poll interval (DB polling mode)`)

        this.intervalId = setInterval(() => {
            this.poll()
        }, pollIntervalMs)

        // Run an initial poll immediately
        this.poll()
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            logger.info('📅 [SchedulePoller] Stopped')
        }
    }

    private async poll(): Promise<void> {
        // Prevent overlapping polls within this process
        if (this.running) return
        this.running = true

        try {
            const scheduleRepo = this.appDataSource.getRepository(Schedule)
            const now = new Date()

            const dueSchedules = await scheduleRepo.find({
                where: {
                    enabled: true,
                    nextRunDate: LessThanOrEqual(now)
                }
            })

            for (const schedule of dueSchedules) {
                try {
                    await this.executeSchedule(schedule)
                } catch (error) {
                    logger.error(`[SchedulePoller] Failed to execute schedule ${schedule.id}:`, { error })
                }
            }
        } catch (error) {
            logger.error('[SchedulePoller] Poll failed:', { error })
        } finally {
            this.running = false
        }
    }

    /**
     * Attempt to claim a schedule using an atomic UPDATE ... WHERE.
     * Advances nextRunDate to the next occurrence. Only the instance whose
     * UPDATE affects exactly 1 row wins the lock; all others see 0 affected
     * rows and skip execution. This prevents duplicate runs across multiple
     * server instances without requiring Redis or advisory locks.
     */
    private async tryClaimSchedule(schedule: Schedule): Promise<Date | null> {
        let nextRunDate: Date
        try {
            const interval = parseExpression(schedule.cronExpression, { tz: schedule.timezone })
            nextRunDate = interval.next().toDate()
        } catch {
            logger.error(`[SchedulePoller] Invalid cron for schedule ${schedule.id}, disabling`)
            await this.appDataSource.getRepository(Schedule).update(schedule.id, { enabled: false })
            return null
        }

        // Atomic claim: only succeeds if nextRunDate still matches what we read
        const result = await this.appDataSource
            .getRepository(Schedule)
            .createQueryBuilder()
            .update(Schedule)
            .set({ nextRunDate })
            .where('id = :id AND "nextRunDate" = :currentNextRunDate', {
                id: schedule.id,
                currentNextRunDate: schedule.nextRunDate
            })
            .execute()

        if (!result.affected || result.affected === 0) {
            // Another instance already claimed this schedule
            return null
        }

        return nextRunDate
    }

    private async executeSchedule(schedule: Schedule): Promise<void> {
        const scheduleRepo = this.appDataSource.getRepository(Schedule)
        const agentflowRepo = this.appDataSource.getRepository(AgentFlow)
        const executionRepo = this.appDataSource.getRepository(Execution)

        // Atomically claim the schedule — returns null if another instance won the race
        const nextRunDate = await this.tryClaimSchedule(schedule)
        if (nextRunDate === null) return

        const agentflow = await agentflowRepo.findOneBy({ id: schedule.agentflowId })
        if (!agentflow) {
            logger.error(`[SchedulePoller] AgentFlow ${schedule.agentflowId} not found for schedule ${schedule.id}`)
            await scheduleRepo.update(schedule.id, {
                lastRunDate: new Date(),
                lastRunStatus: 'ERROR' as ExecutionState
            })
            return
        }

        const chatId = uuidv4()
        let inputPayload: { question?: string; overrideConfig?: any } = {}
        if (schedule.inputPayload) {
            try {
                inputPayload = JSON.parse(schedule.inputPayload)
            } catch {
                logger.warn(`[SchedulePoller] Invalid inputPayload JSON for schedule ${schedule.id}`)
            }
        }

        const sseStreamer = new SSEStreamer()

        const executeParams: IExecuteFlowParams = {
            componentNodes: this.componentNodes,
            telemetry: this.telemetry,
            cachePool: this.cachePool,
            appDataSource: this.appDataSource,
            usageCacheManager: this.usageCacheManager,
            sseStreamer,
            incomingInput: {
                question: inputPayload.question || '',
                overrideConfig: inputPayload.overrideConfig
            },
            agentflow,
            chatId,
            baseURL: process.env.BASE_URL || 'http://localhost:3000',
            isInternal: true
        }

        let executionState: ExecutionState = 'FINISHED'

        logger.info(`[SchedulePoller] Executing schedule "${schedule.name}" (${schedule.id})`)

        try {
            await executeFlow(executeParams)
        } catch (error: any) {
            executionState = 'ERROR'
            logger.error(`[SchedulePoller] Schedule ${schedule.id} execution failed:`, { error })
        }

        // Tag the execution created by executeFlow with the scheduleId
        try {
            await executionRepo.update({ sessionId: chatId }, { scheduleId: schedule.id })
        } catch (error) {
            logger.warn(`[SchedulePoller] Failed to tag execution with scheduleId:`, { error })
        }

        // Update schedule status
        await scheduleRepo.update(schedule.id, {
            lastRunDate: new Date(),
            lastRunStatus: executionState
        })

        logger.info(`[SchedulePoller] Schedule "${schedule.name}" completed with status: ${executionState}`)
    }
}
