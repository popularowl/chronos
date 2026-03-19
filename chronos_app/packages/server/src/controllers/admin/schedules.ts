import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import schedulesService from '../../services/schedules'

const getAllSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const agentflowId = req.query.agentflowId as string | undefined
        const data = await schedulesService.getAllSchedules(page, limit, agentflowId)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getScheduleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Schedule id is required')
        }
        const data = await schedulesService.getScheduleById(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const createSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await schedulesService.createSchedule(req.body)
        return res.status(StatusCodes.CREATED).json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Schedule id is required')
        }
        const data = await schedulesService.updateSchedule(req.params.id, req.body)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Schedule id is required')
        }
        const data = await schedulesService.deleteSchedule(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const toggleSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Schedule id is required')
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'enabled (boolean) is required')
        }
        const data = await schedulesService.toggleSchedule(req.params.id, req.body.enabled)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getScheduleExecutions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Schedule id is required')
        }
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const data = await schedulesService.getScheduleExecutions(req.params.id, page, limit)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

export default {
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleSchedule,
    getScheduleExecutions
}
