import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import schedulesService from '../../services/schedules'
import { getPageAndLimitParams } from '../../utils/pagination'

const createSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: schedulesController.createSchedule - body not provided!`
            )
        }
        const body = { ...req.body, userId: req.userId }
        const apiResponse = await schedulesService.createSchedule(body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: schedulesController.deleteSchedule - id not provided!`)
        }
        const apiResponse = await schedulesService.deleteSchedule(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const agentflowId = req.query.agentflowId as string | undefined
        const apiResponse = await schedulesService.getAllSchedules(page, limit, agentflowId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getScheduleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: schedulesController.getScheduleById - id not provided!`)
        }
        const apiResponse = await schedulesService.getScheduleById(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: schedulesController.updateSchedule - id not provided!`)
        }
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: schedulesController.updateSchedule - body not provided!`
            )
        }
        const apiResponse = await schedulesService.updateSchedule(req.params.id, req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const toggleSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: schedulesController.toggleSchedule - id not provided!`)
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: schedulesController.toggleSchedule - enabled (boolean) not provided!`
            )
        }
        const apiResponse = await schedulesService.toggleSchedule(req.params.id, req.body.enabled)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getScheduleExecutions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: schedulesController.getScheduleExecutions - id not provided!`
            )
        }
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await schedulesService.getScheduleExecutions(req.params.id, page, limit)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
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
