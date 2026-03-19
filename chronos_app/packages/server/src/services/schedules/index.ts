import { StatusCodes } from 'http-status-codes'
import { parseExpression } from 'cron-parser'
import { Schedule } from '../../database/entities/Schedule'
import { Execution } from '../../database/entities/Execution'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { QueueManager } from '../../queue/QueueManager'
import { ScheduleQueue } from '../../queue/ScheduleQueue'
import { MODE } from '../../Interface'
import logger from '../../utils/logger'

const isSchedulingEnabled = (): boolean => process.env.ENABLE_SCHEDULES === 'true'

const assertSchedulingEnabled = (): void => {
    if (!isSchedulingEnabled()) {
        throw new InternalChronosError(
            StatusCodes.SERVICE_UNAVAILABLE,
            'Scheduling is not enabled. Set ENABLE_SCHEDULES=true to enable it.'
        )
    }
}

const getScheduleQueue = (): ScheduleQueue | null => {
    if (process.env.MODE !== MODE.QUEUE || !isSchedulingEnabled()) return null
    try {
        return QueueManager.getInstance().getQueue('schedule') as ScheduleQueue
    } catch {
        return null
    }
}

const createSchedule = async (requestBody: any): Promise<any> => {
    try {
        assertSchedulingEnabled()
        const appServer = getRunningExpressApp()

        if (!requestBody.cronExpression) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'cronExpression is required')
        }
        if (!requestBody.agentflowId) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'agentflowId is required')
        }
        if (!requestBody.name) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'name is required')
        }

        // Validate cron expression
        try {
            parseExpression(requestBody.cronExpression)
        } catch {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid cron expression: ${requestBody.cronExpression}`)
        }

        // Validate agentflow exists
        const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({ id: requestBody.agentflowId })
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `AgentFlow ${requestBody.agentflowId} not found`)
        }

        // Validate inputPayload is valid JSON if provided
        if (requestBody.inputPayload && typeof requestBody.inputPayload === 'string') {
            try {
                JSON.parse(requestBody.inputPayload)
            } catch {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'inputPayload must be valid JSON')
            }
        }

        const newSchedule = new Schedule()
        Object.assign(newSchedule, requestBody)

        // Compute next run date
        try {
            const interval = parseExpression(requestBody.cronExpression, { tz: requestBody.timezone || 'UTC' })
            newSchedule.nextRunDate = interval.next().toDate()
        } catch {
            // non-fatal
        }

        const schedule = appServer.AppDataSource.getRepository(Schedule).create(newSchedule)
        const dbResponse = await appServer.AppDataSource.getRepository(Schedule).save(schedule)

        // Register BullMQ repeatable job if enabled
        if (dbResponse.enabled !== false) {
            const scheduleQueue = getScheduleQueue()
            if (scheduleQueue) {
                await scheduleQueue.addRepeatableJob(dbResponse)
            }
        }

        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.createSchedule - ${getErrorMessage(error)}`
        )
    }
}

const deleteSchedule = async (scheduleId: string): Promise<any> => {
    try {
        assertSchedulingEnabled()
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(Schedule).findOneBy({ id: scheduleId })
        if (!schedule) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Schedule ${scheduleId} not found`)
        }

        // Remove repeatable job
        const scheduleQueue = getScheduleQueue()
        if (scheduleQueue) {
            try {
                await scheduleQueue.removeRepeatableJob(scheduleId, schedule.cronExpression, schedule.timezone)
            } catch (error) {
                logger.warn(`[ScheduleService] Failed to remove repeatable job for schedule ${scheduleId}:`, { error })
            }
        }

        const dbResponse = await appServer.AppDataSource.getRepository(Schedule).delete({ id: scheduleId })
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.deleteSchedule - ${getErrorMessage(error)}`
        )
    }
}

const getAllSchedules = async (page: number = -1, limit: number = -1, agentflowId?: string) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(Schedule)
            .createQueryBuilder('schedule')
            .orderBy('schedule.updatedDate', 'DESC')

        if (agentflowId) {
            queryBuilder.andWhere('schedule.agentflowId = :agentflowId', { agentflowId })
        }

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        if (page > 0 && limit > 0) {
            return { data, total }
        } else {
            return data
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.getAllSchedules - ${getErrorMessage(error)}`
        )
    }
}

const getScheduleById = async (scheduleId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(Schedule).findOneBy({ id: scheduleId })
        if (!dbResponse) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Schedule ${scheduleId} not found`)
        }
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.getScheduleById - ${getErrorMessage(error)}`
        )
    }
}

const updateSchedule = async (scheduleId: string, scheduleBody: any): Promise<any> => {
    try {
        assertSchedulingEnabled()
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(Schedule).findOneBy({ id: scheduleId })
        if (!schedule) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Schedule ${scheduleId} not found`)
        }

        // Validate cron if changed
        if (scheduleBody.cronExpression) {
            try {
                parseExpression(scheduleBody.cronExpression)
            } catch {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid cron expression: ${scheduleBody.cronExpression}`)
            }
        }

        // Validate inputPayload is valid JSON if provided
        if (scheduleBody.inputPayload && typeof scheduleBody.inputPayload === 'string') {
            try {
                JSON.parse(scheduleBody.inputPayload)
            } catch {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'inputPayload must be valid JSON')
            }
        }

        const cronChanged = scheduleBody.cronExpression && scheduleBody.cronExpression !== schedule.cronExpression
        const tzChanged = scheduleBody.timezone && scheduleBody.timezone !== schedule.timezone
        const enabledChanged = typeof scheduleBody.enabled === 'boolean' && scheduleBody.enabled !== schedule.enabled

        // Remove old repeatable job if cron/tz/enabled changed
        const scheduleQueue = getScheduleQueue()
        if (scheduleQueue && (cronChanged || tzChanged || enabledChanged)) {
            try {
                await scheduleQueue.removeRepeatableJob(scheduleId, schedule.cronExpression, schedule.timezone)
            } catch (error) {
                logger.warn(`[ScheduleService] Failed to remove old repeatable job:`, { error })
            }
        }

        const updatedSchedule = new Schedule()
        Object.assign(updatedSchedule, scheduleBody)
        appServer.AppDataSource.getRepository(Schedule).merge(schedule, updatedSchedule)

        // Recompute nextRunDate
        const finalCron = schedule.cronExpression
        const finalTz = schedule.timezone
        try {
            const interval = parseExpression(finalCron, { tz: finalTz })
            schedule.nextRunDate = interval.next().toDate()
        } catch {
            // non-fatal
        }

        const dbResponse = await appServer.AppDataSource.getRepository(Schedule).save(schedule)

        // Re-add repeatable job if enabled and cron/tz changed
        if (scheduleQueue && dbResponse.enabled && (cronChanged || tzChanged || enabledChanged)) {
            await scheduleQueue.addRepeatableJob(dbResponse)
        }

        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.updateSchedule - ${getErrorMessage(error)}`
        )
    }
}

const toggleSchedule = async (scheduleId: string, enabled: boolean): Promise<any> => {
    try {
        assertSchedulingEnabled()
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(Schedule).findOneBy({ id: scheduleId })
        if (!schedule) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Schedule ${scheduleId} not found`)
        }

        const scheduleQueue = getScheduleQueue()
        if (scheduleQueue) {
            if (enabled) {
                await scheduleQueue.addRepeatableJob(schedule)
            } else {
                try {
                    await scheduleQueue.removeRepeatableJob(scheduleId, schedule.cronExpression, schedule.timezone)
                } catch (error) {
                    logger.warn(`[ScheduleService] Failed to remove repeatable job on toggle:`, { error })
                }
            }
        }

        schedule.enabled = enabled
        if (enabled) {
            try {
                const interval = parseExpression(schedule.cronExpression, { tz: schedule.timezone })
                schedule.nextRunDate = interval.next().toDate()
            } catch {
                // non-fatal
            }
        }

        const dbResponse = await appServer.AppDataSource.getRepository(Schedule).save(schedule)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.toggleSchedule - ${getErrorMessage(error)}`
        )
    }
}

const getScheduleExecutions = async (scheduleId: string, page: number = -1, limit: number = -1) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(Execution)
            .createQueryBuilder('execution')
            .where('execution.scheduleId = :scheduleId', { scheduleId })
            .orderBy('execution.createdDate', 'DESC')

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        if (page > 0 && limit > 0) {
            return { data, total }
        } else {
            return data
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: schedulesService.getScheduleExecutions - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createSchedule,
    deleteSchedule,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    toggleSchedule,
    getScheduleExecutions
}
