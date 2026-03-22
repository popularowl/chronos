import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import webhooksService from '../../services/webhooks'
import { getPageAndLimitParams } from '../../utils/pagination'

const createWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.createWebhook - body not provided!`)
        }
        const body = { ...req.body, userId: req.userId }
        const apiResponse = await webhooksService.createWebhook(body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.deleteWebhook - id not provided!`)
        }
        const apiResponse = await webhooksService.deleteWebhook(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllWebhooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const agentflowId = req.query.agentflowId as string | undefined
        const apiResponse = await webhooksService.getAllWebhooks(page, limit, agentflowId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getWebhookById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.getWebhookById - id not provided!`)
        }
        const apiResponse = await webhooksService.getWebhookById(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.updateWebhook - id not provided!`)
        }
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.updateWebhook - body not provided!`)
        }
        const apiResponse = await webhooksService.updateWebhook(req.params.id, req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const toggleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.toggleWebhook - id not provided!`)
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: webhooksController.toggleWebhook - enabled (boolean) not provided!`
            )
        }
        const apiResponse = await webhooksService.toggleWebhook(req.params.id, req.body.enabled)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getWebhookDeliveries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: webhooksController.getWebhookDeliveries - id not provided!`
            )
        }
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await webhooksService.getWebhookDeliveries(req.params.id, page, limit)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const regenerateSecret = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.regenerateSecret - id not provided!`)
        }
        const apiResponse = await webhooksService.regenerateSecret(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const testWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: webhooksController.testWebhook - id not provided!`)
        }
        const apiResponse = await webhooksService.testWebhook(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createWebhook,
    deleteWebhook,
    getAllWebhooks,
    getWebhookById,
    updateWebhook,
    toggleWebhook,
    getWebhookDeliveries,
    regenerateSecret,
    testWebhook
}
