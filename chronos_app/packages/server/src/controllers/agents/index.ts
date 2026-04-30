import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import agentsService from '../../services/agents'
import { getPageAndLimitParams } from '../../utils/pagination'

const createAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.createAgent - body not provided!`)
        }
        const body = { ...req.body, userId: req.userId }
        const apiResponse = await agentsService.createAgent(body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.updateAgent - id not provided!`)
        }
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.updateAgent - body not provided!`)
        }
        const apiResponse = await agentsService.updateAgent(req.params.id, req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.deleteAgent - id not provided!`)
        }
        const apiResponse = await agentsService.deleteAgent(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllAgents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const filters = {
            runtimeType: req.query.runtimeType as string | undefined,
            status: req.query.status as string | undefined,
            agentflowId: req.query.agentflowId as string | undefined
        }
        const apiResponse = await agentsService.getAllAgents(page, limit, filters)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAgentById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.getAgentById - id not provided!`)
        }
        const apiResponse = await agentsService.getAgentById(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const toggleAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: agentsController.toggleAgent - id not provided!`)
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentsController.toggleAgent - enabled (boolean) not provided!`
            )
        }
        const apiResponse = await agentsService.toggleAgent(req.params.id, req.body.enabled)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const regenerateCallbackToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentsController.regenerateCallbackToken - id not provided!`
            )
        }
        const apiResponse = await agentsService.regenerateCallbackToken(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const testAgentConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentsController.testAgentConnection - id not provided!`
            )
        }
        const apiResponse = await agentsService.testAgentConnection(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createAgent,
    updateAgent,
    deleteAgent,
    getAllAgents,
    getAgentById,
    toggleAgent,
    regenerateCallbackToken,
    testAgentConnection
}
