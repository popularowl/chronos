import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { AgentflowType } from '../../Interface'
import { UserContext } from '../../Interface.Auth'
import apiKeyService from '../../services/apikey'
import agentflowsService from '../../services/agentflows'
import { RateLimiterManager } from '../../utils/rateLimit'
import { getPageAndLimitParams } from '../../utils/pagination'

/**
 * Build a UserContext from the Express request.
 * @param req - Express request with userId/userRole set by auth middleware
 * @returns UserContext or undefined if no auth info present
 */
const getUserContext = (req: Request): UserContext | undefined => {
    if (!req.userId || !req.userRole) return undefined
    return { userId: req.userId, role: req.userRole }
}

const checkIfAgentflowIsValidForStreaming = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.checkIfAgentflowIsValidForStreaming - id not provided!`
            )
        }
        const apiResponse = await agentflowsService.checkIfAgentflowIsValidForStreaming(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const checkIfAgentflowIsValidForUploads = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.checkIfAgentflowIsValidForUploads - id not provided!`
            )
        }
        const apiResponse = await agentflowsService.checkIfAgentflowIsValidForUploads(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.deleteAgentflow - id not provided!`
            )
        }
        const apiResponse = await agentflowsService.deleteAgentflow(req.params.id, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllAgentflows = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await agentflowsService.getAllAgentflows(req.query?.type as AgentflowType, page, limit, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

// Get specific agentflow via api key
const getAgentflowByApiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.apikey) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.getAgentflowByApiKey - apikey not provided!`
            )
        }
        const apikey = await apiKeyService.getApiKey(req.params.apikey)
        if (!apikey) {
            return res.status(401).send('Unauthorized')
        }
        const apiResponse = await agentflowsService.getAgentflowByApiKey(apikey.id, req.query.keyonly)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAgentflowById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.getAgentflowById - id not provided!`
            )
        }
        const apiResponse = await agentflowsService.getAgentflowById(req.params.id, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const saveAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.saveAgentflow - body not provided!`
            )
        }
        const body = req.body
        const newAgentFlow = new AgentFlow()
        Object.assign(newAgentFlow, body)
        const apiResponse = await agentflowsService.saveAgentflow(newAgentFlow, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.updateAgentflow - id not provided!`
            )
        }
        const userContext = getUserContext(req)
        const agentflow = await agentflowsService.getAgentflowById(req.params.id, userContext)
        if (!agentflow) {
            return res.status(404).send(`Agentflow ${req.params.id} not found`)
        }
        const body = req.body
        const updateAgentFlow = new AgentFlow()
        Object.assign(updateAgentFlow, body)

        updateAgentFlow.id = agentflow.id
        const rateLimiterManager = RateLimiterManager.getInstance()
        await rateLimiterManager.updateRateLimiter(updateAgentFlow)

        const apiResponse = await agentflowsService.updateAgentflow(agentflow, updateAgentFlow, userContext)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const checkIfAgentflowHasChanged = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.checkIfAgentflowHasChanged - id not provided!`
            )
        }
        if (!req.params.lastUpdatedDateTime) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: agentflowsController.checkIfAgentflowHasChanged - lastUpdatedDateTime not provided!`
            )
        }
        const apiResponse = await agentflowsService.checkIfAgentflowHasChanged(req.params.id, req.params.lastUpdatedDateTime)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    checkIfAgentflowIsValidForStreaming,
    checkIfAgentflowIsValidForUploads,
    deleteAgentflow,
    getAllAgentflows,
    getAgentflowByApiKey,
    getAgentflowById,
    saveAgentflow,
    updateAgentflow,
    checkIfAgentflowHasChanged
}
