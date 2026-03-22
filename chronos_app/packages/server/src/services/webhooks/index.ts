import crypto from 'crypto'
import { StatusCodes } from 'http-status-codes'
import { Webhook } from '../../database/entities/Webhook'
import { WebhookDelivery } from '../../database/entities/WebhookDelivery'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { WebhookEvent } from '../../Interface'

const VALID_EVENTS: WebhookEvent[] = ['execution.completed', 'execution.failed', 'execution.timeout']

const isWebhooksEnabled = (): boolean => process.env.ENABLE_WEBHOOKS === 'true'

const assertWebhooksEnabled = (): void => {
    if (!isWebhooksEnabled()) {
        throw new InternalChronosError(
            StatusCodes.SERVICE_UNAVAILABLE,
            'Webhooks are not enabled. Set ENABLE_WEBHOOKS=true to enable them.'
        )
    }
}

const generateSecret = (): string => crypto.randomBytes(32).toString('hex')

const createWebhook = async (requestBody: any): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()

        if (!requestBody.name) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'name is required')
        }
        if (!requestBody.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'url is required')
        }
        if (!requestBody.agentflowId) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'agentflowId is required')
        }

        // Validate URL format
        try {
            const parsed = new URL(requestBody.url)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid protocol')
            }
        } catch {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'url must be a valid HTTP or HTTPS URL')
        }

        // Validate agentflow exists
        const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({ id: requestBody.agentflowId })
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `AgentFlow ${requestBody.agentflowId} not found`)
        }

        // Validate events
        let events: string[] = []
        if (requestBody.events) {
            events = typeof requestBody.events === 'string' ? JSON.parse(requestBody.events) : requestBody.events
            for (const event of events) {
                if (!VALID_EVENTS.includes(event as WebhookEvent)) {
                    throw new InternalChronosError(
                        StatusCodes.BAD_REQUEST,
                        `Invalid event: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`
                    )
                }
            }
        } else {
            events = [...VALID_EVENTS]
        }

        const newWebhook = new Webhook()
        newWebhook.name = requestBody.name
        newWebhook.url = requestBody.url
        newWebhook.agentflowId = requestBody.agentflowId
        newWebhook.events = JSON.stringify(events)
        newWebhook.secret = generateSecret()
        newWebhook.enabled = requestBody.enabled !== false
        newWebhook.maxRetries = requestBody.maxRetries ?? 3
        newWebhook.timeoutMs = requestBody.timeoutMs ?? 10000
        newWebhook.userId = requestBody.userId || null

        const webhook = appServer.AppDataSource.getRepository(Webhook).create(newWebhook)
        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).save(webhook)

        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.createWebhook - ${getErrorMessage(error)}`
        )
    }
}

const deleteWebhook = async (webhookId: string): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()
        const webhook = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!webhook) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }

        // Delete associated deliveries
        await appServer.AppDataSource.getRepository(WebhookDelivery).delete({ webhookId })

        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).delete({ id: webhookId })
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.deleteWebhook - ${getErrorMessage(error)}`
        )
    }
}

const getAllWebhooks = async (page: number = -1, limit: number = -1, agentflowId?: string) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(Webhook)
            .createQueryBuilder('webhook')
            .orderBy('webhook.updatedDate', 'DESC')

        if (agentflowId) {
            queryBuilder.andWhere('webhook.agentflowId = :agentflowId', { agentflowId })
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
            `Error: webhooksService.getAllWebhooks - ${getErrorMessage(error)}`
        )
    }
}

const getWebhookById = async (webhookId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!dbResponse) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.getWebhookById - ${getErrorMessage(error)}`
        )
    }
}

const updateWebhook = async (webhookId: string, webhookBody: any): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()
        const webhook = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!webhook) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }

        // Validate URL if changed
        if (webhookBody.url) {
            try {
                const parsed = new URL(webhookBody.url)
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    throw new Error('Invalid protocol')
                }
            } catch {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'url must be a valid HTTP or HTTPS URL')
            }
        }

        // Validate events if changed
        if (webhookBody.events) {
            const events = typeof webhookBody.events === 'string' ? JSON.parse(webhookBody.events) : webhookBody.events
            for (const event of events) {
                if (!VALID_EVENTS.includes(event as WebhookEvent)) {
                    throw new InternalChronosError(
                        StatusCodes.BAD_REQUEST,
                        `Invalid event: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`
                    )
                }
            }
            webhookBody.events = JSON.stringify(events)
        }

        const updatedWebhook = new Webhook()
        Object.assign(updatedWebhook, webhookBody)
        // Never allow updating the secret via regular update
        delete (updatedWebhook as any).secret
        appServer.AppDataSource.getRepository(Webhook).merge(webhook, updatedWebhook)

        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).save(webhook)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.updateWebhook - ${getErrorMessage(error)}`
        )
    }
}

const toggleWebhook = async (webhookId: string, enabled: boolean): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()
        const webhook = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!webhook) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }

        webhook.enabled = enabled
        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).save(webhook)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.toggleWebhook - ${getErrorMessage(error)}`
        )
    }
}

const getWebhookDeliveries = async (webhookId: string, page: number = -1, limit: number = -1) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(WebhookDelivery)
            .createQueryBuilder('delivery')
            .where('delivery.webhookId = :webhookId', { webhookId })
            .orderBy('delivery.createdDate', 'DESC')

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
            `Error: webhooksService.getWebhookDeliveries - ${getErrorMessage(error)}`
        )
    }
}

const regenerateSecret = async (webhookId: string): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()
        const webhook = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!webhook) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }

        webhook.secret = generateSecret()
        const dbResponse = await appServer.AppDataSource.getRepository(Webhook).save(webhook)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: webhooksService.regenerateSecret - ${getErrorMessage(error)}`
        )
    }
}

const testWebhook = async (webhookId: string): Promise<any> => {
    try {
        assertWebhooksEnabled()
        const appServer = getRunningExpressApp()
        const webhook = await appServer.AppDataSource.getRepository(Webhook).findOneBy({ id: webhookId })
        if (!webhook) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Webhook ${webhookId} not found`)
        }

        const testPayload = JSON.stringify({
            event: 'webhook.test',
            timestamp: new Date().toISOString(),
            execution: {
                id: 'test-execution-id',
                agentflowId: webhook.agentflowId,
                sessionId: 'test-session-id',
                state: 'FINISHED',
                triggerType: 'test',
                durationMs: 0,
                createdDate: new Date().toISOString(),
                stoppedDate: new Date().toISOString()
            },
            result: {}
        })

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Chronos-Event': 'webhook.test',
            'X-Chronos-Delivery': 'test-delivery',
            'User-Agent': 'Chronos-Webhooks/1.0'
        }

        if (webhook.secret) {
            const signature = crypto.createHmac('sha256', webhook.secret).update(testPayload).digest('hex')
            headers['X-Chronos-Signature-256'] = `sha256=${signature}`
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), webhook.timeoutMs)

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers,
                body: testPayload,
                signal: controller.signal
            })
            clearTimeout(timeoutId)

            return {
                success: response.ok,
                statusCode: response.status,
                message: response.ok ? 'Test webhook delivered successfully' : `Received HTTP ${response.status}`
            }
        } catch (fetchError) {
            clearTimeout(timeoutId)
            return {
                success: false,
                statusCode: null,
                message: `Failed to deliver test webhook: ${getErrorMessage(fetchError)}`
            }
        }
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: webhooksService.testWebhook - ${getErrorMessage(error)}`)
    }
}

export default {
    isWebhooksEnabled,
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
