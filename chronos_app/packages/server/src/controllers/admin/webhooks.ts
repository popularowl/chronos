import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import webhooksService from '../../services/webhooks'

const getAllWebhooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const agentflowId = req.query.agentflowId as string | undefined
        const data = await webhooksService.getAllWebhooks(page, limit, agentflowId)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getWebhookById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const data = await webhooksService.getWebhookById(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const createWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await webhooksService.createWebhook(req.body)
        return res.status(StatusCodes.CREATED).json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const updateWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const data = await webhooksService.updateWebhook(req.params.id, req.body)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const deleteWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const data = await webhooksService.deleteWebhook(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const toggleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'enabled (boolean) is required')
        }
        const data = await webhooksService.toggleWebhook(req.params.id, req.body.enabled)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getWebhookDeliveries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const data = await webhooksService.getWebhookDeliveries(req.params.id, page, limit)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const regenerateSecret = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const data = await webhooksService.regenerateSecret(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const testWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Webhook id is required')
        }
        const data = await webhooksService.testWebhook(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

export default {
    getAllWebhooks,
    getWebhookById,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    toggleWebhook,
    getWebhookDeliveries,
    regenerateSecret,
    testWebhook
}
