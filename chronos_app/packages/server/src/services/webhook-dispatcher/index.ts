import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { DataSource } from 'typeorm'
import { Webhook } from '../../database/entities/Webhook'
import { WebhookDelivery } from '../../database/entities/WebhookDelivery'
import { WebhookEvent, IAgentflowExecutedData } from '../../Interface'
import logger from '../../utils/logger'

const STATE_TO_EVENT: Record<string, WebhookEvent> = {
    FINISHED: 'execution.completed',
    ERROR: 'execution.failed',
    TERMINATED: 'execution.failed',
    TIMEOUT: 'execution.timeout'
}

const MAX_BACKOFF_MS = 30000

/**
 * Dispatches webhooks for a completed execution.
 * Non-blocking, fire-and-forget with retry logic.
 */
export const dispatchWebhooks = async (
    appDataSource: DataSource,
    execution: {
        id: string
        agentflowId: string
        executionData?: string
        state?: string
        sessionId?: string
        createdDate?: Date
        updatedDate?: Date
        stoppedDate?: Date
    },
    triggerType: string = 'manual'
): Promise<void> => {
    try {
        if (process.env.ENABLE_WEBHOOKS !== 'true') return
        if (!execution.id || !execution.agentflowId || !execution.state) return

        const event = STATE_TO_EVENT[execution.state]
        if (!event) return

        const webhooks = await appDataSource.getRepository(Webhook).find({
            where: {
                agentflowId: execution.agentflowId,
                enabled: true
            }
        })

        if (webhooks.length === 0) return

        // Build payload
        let durationMs = 0
        if (execution.stoppedDate && execution.createdDate) {
            const created = execution.createdDate instanceof Date ? execution.createdDate : new Date(execution.createdDate)
            const stopped = execution.stoppedDate instanceof Date ? execution.stoppedDate : new Date(execution.stoppedDate)
            durationMs = stopped.getTime() - created.getTime()
        } else if (execution.createdDate && execution.updatedDate) {
            const created = execution.createdDate instanceof Date ? execution.createdDate : new Date(execution.createdDate)
            const updated = execution.updatedDate instanceof Date ? execution.updatedDate : new Date(execution.updatedDate)
            durationMs = updated.getTime() - created.getTime()
        }

        // Extract final node outputs
        let result: any = {}
        try {
            if (execution.executionData) {
                const executedNodes: IAgentflowExecutedData[] =
                    typeof execution.executionData === 'string' ? JSON.parse(execution.executionData) : execution.executionData
                if (executedNodes.length > 0) {
                    const lastNode = executedNodes[executedNodes.length - 1]
                    result = lastNode.data || {}
                }
            }
        } catch {
            // non-fatal
        }

        const payloadObj = {
            event,
            timestamp: new Date().toISOString(),
            execution: {
                id: execution.id,
                agentflowId: execution.agentflowId,
                sessionId: execution.sessionId || null,
                state: execution.state,
                triggerType,
                durationMs: Math.max(0, durationMs),
                createdDate: execution.createdDate ? new Date(execution.createdDate).toISOString() : null,
                stoppedDate: execution.stoppedDate ? new Date(execution.stoppedDate).toISOString() : null
            },
            result
        }

        const payloadStr = JSON.stringify(payloadObj)

        for (const webhook of webhooks) {
            // Check if this webhook is subscribed to this event
            let subscribedEvents: string[] = []
            try {
                subscribedEvents = JSON.parse(webhook.events)
            } catch {
                continue
            }
            if (!subscribedEvents.includes(event)) continue

            // Fire-and-forget delivery with retry
            deliverWithRetry(appDataSource, webhook, payloadStr, event, execution.id).catch((err) =>
                logger.warn(`[WebhookDispatcher] Delivery failed for webhook ${webhook.id}: ${err}`)
            )
        }
    } catch (error) {
        logger.warn(`[WebhookDispatcher] Failed to dispatch webhooks for execution ${execution.id}: ${error}`)
    }
}

async function deliverWithRetry(
    appDataSource: DataSource,
    webhook: Webhook,
    payload: string,
    event: string,
    executionId: string
): Promise<void> {
    const maxAttempts = webhook.maxRetries + 1 // first attempt + retries

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const deliveryId = uuidv4()
        const delivery = new WebhookDelivery()
        delivery.id = deliveryId
        delivery.webhookId = webhook.id
        delivery.executionId = executionId
        delivery.agentflowId = webhook.agentflowId
        delivery.event = event
        delivery.payload = payload
        delivery.attempt = attempt
        delivery.success = false

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-Chronos-Event': event,
                'X-Chronos-Delivery': deliveryId,
                'User-Agent': 'Chronos-Webhooks/1.0'
            }

            if (webhook.secret) {
                const signature = crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex')
                headers['X-Chronos-Signature-256'] = `sha256=${signature}`
            }

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), webhook.timeoutMs)

            const response = await fetch(webhook.url, {
                method: 'POST',
                headers,
                body: payload,
                signal: controller.signal
            })
            clearTimeout(timeoutId)

            delivery.statusCode = response.status
            delivery.success = response.ok

            // Truncate response body to 4KB
            try {
                const body = await response.text()
                delivery.responseBody = body.substring(0, 4096)
            } catch {
                // non-fatal
            }

            delivery.deliveredAt = new Date()
            await appDataSource.getRepository(WebhookDelivery).save(delivery)

            if (response.ok) {
                logger.info(`[WebhookDispatcher] Delivered webhook ${webhook.id} for execution ${executionId} (attempt ${attempt})`)
                return
            }

            logger.warn(`[WebhookDispatcher] Webhook ${webhook.id} returned HTTP ${response.status} (attempt ${attempt}/${maxAttempts})`)
        } catch (error: any) {
            delivery.errorMessage = error?.message || String(error)
            delivery.deliveredAt = new Date()
            await appDataSource
                .getRepository(WebhookDelivery)
                .save(delivery)
                .catch(() => {})

            logger.warn(`[WebhookDispatcher] Webhook ${webhook.id} delivery error (attempt ${attempt}/${maxAttempts}): ${error?.message}`)
        }

        // If we have more attempts, wait with exponential backoff
        if (attempt < maxAttempts) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)
            await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
    }
}

export default {
    dispatchWebhooks
}
