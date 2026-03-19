import { DataSource } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { parseExpression } from 'cron-parser'
import { executeFlow } from '../utils/buildAgentflow'
import { IComponentNodes, IExecuteFlowParams, ExecutionState } from '../Interface'
import { Telemetry } from '../utils/telemetry'
import { CachePool } from '../CachePool'
import { BaseQueue } from './BaseQueue'
import { RedisOptions } from 'bullmq'
import { UsageCacheManager } from '../UsageCacheManager'
import { Schedule } from '../database/entities/Schedule'
import { Execution } from '../database/entities/Execution'
import { AgentFlow } from '../database/entities/AgentFlow'
import { SSEStreamer } from '../utils/SSEStreamer'
import logger from '../utils/logger'

interface ScheduleQueueOptions {
    appDataSource: DataSource
    telemetry: Telemetry
    cachePool: CachePool
    componentNodes: IComponentNodes
    usageCacheManager: UsageCacheManager
}

export class ScheduleQueue extends BaseQueue {
    private componentNodes: IComponentNodes
    private telemetry: Telemetry
    private cachePool: CachePool
    private appDataSource: DataSource
    private usageCacheManager: UsageCacheManager
    private queueName: string

    constructor(name: string, connection: RedisOptions, options: ScheduleQueueOptions) {
        super(name, connection)
        this.queueName = name
        this.componentNodes = options.componentNodes || {}
        this.telemetry = options.telemetry
        this.cachePool = options.cachePool
        this.appDataSource = options.appDataSource
        this.usageCacheManager = options.usageCacheManager
    }

    public getQueueName() {
        return this.queueName
    }

    public getQueue() {
        return this.queue
    }

    async processJob(data: { scheduleId: string }): Promise<any> {
        const scheduleId = data.scheduleId
        const scheduleRepo = this.appDataSource.getRepository(Schedule)
        const agentflowRepo = this.appDataSource.getRepository(AgentFlow)
        const executionRepo = this.appDataSource.getRepository(Execution)

        const schedule = await scheduleRepo.findOneBy({ id: scheduleId })
        if (!schedule) {
            logger.error(`[ScheduleQueue] Schedule ${scheduleId} not found, skipping`)
            return
        }

        const agentflow = await agentflowRepo.findOneBy({ id: schedule.agentflowId })
        if (!agentflow) {
            logger.error(`[ScheduleQueue] AgentFlow ${schedule.agentflowId} not found for schedule ${scheduleId}`)
            await scheduleRepo.update(scheduleId, {
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
                logger.warn(`[ScheduleQueue] Invalid inputPayload JSON for schedule ${scheduleId}`)
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

        try {
            await executeFlow(executeParams)
        } catch (error: any) {
            executionState = 'ERROR'
            logger.error(`[ScheduleQueue] Schedule ${scheduleId} execution failed:`, { error })
        }

        // Tag the execution created by executeFlow with the scheduleId.
        // executeFlow uses chatId as sessionId for the execution record.
        try {
            await executionRepo.update({ sessionId: chatId }, { scheduleId })
        } catch (error) {
            logger.warn(`[ScheduleQueue] Failed to tag execution with scheduleId:`, { error })
        }

        // Update schedule
        let nextRunDate: Date | undefined
        try {
            const interval = parseExpression(schedule.cronExpression, { tz: schedule.timezone })
            nextRunDate = interval.next().toDate()
        } catch {
            // cron parse error, leave nextRunDate as-is
        }

        await scheduleRepo.update(scheduleId, {
            lastRunDate: new Date(),
            lastRunStatus: executionState,
            ...(nextRunDate ? { nextRunDate } : {})
        })

        return { scheduleId, state: executionState }
    }

    public async addRepeatableJob(schedule: Schedule): Promise<void> {
        await this.queue.add(
            `schedule-${schedule.id}`,
            { scheduleId: schedule.id },
            {
                repeat: {
                    pattern: schedule.cronExpression,
                    tz: schedule.timezone
                },
                jobId: schedule.id
            }
        )
        logger.info(`[ScheduleQueue] Added repeatable job for schedule ${schedule.id} (${schedule.cronExpression} ${schedule.timezone})`)
    }

    public async removeRepeatableJob(scheduleId: string, cronExpression: string, timezone: string): Promise<void> {
        await this.queue.removeRepeatableByKey(`schedule-${scheduleId}:${scheduleId}:::${cronExpression}:${timezone}`)
        // Also try the standard BullMQ approach
        await this.queue.removeRepeatable(`schedule-${scheduleId}`, {
            pattern: cronExpression,
            tz: timezone
        })
        logger.info(`[ScheduleQueue] Removed repeatable job for schedule ${scheduleId}`)
    }

    public async syncRepeatableJobs(enabledSchedules: Schedule[]): Promise<void> {
        // Remove all existing repeatable jobs first
        const existingRepeatableJobs = await this.queue.getRepeatableJobs()
        for (const job of existingRepeatableJobs) {
            await this.queue.removeRepeatableByKey(job.key)
        }

        // Re-add all enabled schedules
        for (const schedule of enabledSchedules) {
            try {
                await this.addRepeatableJob(schedule)
            } catch (error) {
                logger.error(`[ScheduleQueue] Failed to sync schedule ${schedule.id}:`, { error })
            }
        }

        logger.info(`[ScheduleQueue] Synced ${enabledSchedules.length} repeatable jobs`)
    }
}
