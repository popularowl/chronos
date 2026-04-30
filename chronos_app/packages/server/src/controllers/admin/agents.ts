import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import agentsService from '../../services/agents'

const getAllAgents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const filters = {
            runtimeType: req.query.runtimeType as string | undefined,
            status: req.query.status as string | undefined,
            agentflowId: req.query.agentflowId as string | undefined
        }
        const data = await agentsService.getAllAgents(page, limit, filters)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getAgentById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        const data = await agentsService.getAgentById(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const createAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await agentsService.createAgent(req.body)
        return res.status(StatusCodes.CREATED).json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const updateAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        const data = await agentsService.updateAgent(req.params.id, req.body)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const deleteAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        const data = await agentsService.deleteAgent(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const toggleAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'enabled (boolean) is required')
        }
        const data = await agentsService.toggleAgent(req.params.id, req.body.enabled)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const regenerateCallbackToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        const data = await agentsService.regenerateCallbackToken(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const testAgentConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent id is required')
        }
        const data = await agentsService.testAgentConnection(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

export default {
    getAllAgents,
    getAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgent,
    regenerateCallbackToken,
    testAgentConnection
}
