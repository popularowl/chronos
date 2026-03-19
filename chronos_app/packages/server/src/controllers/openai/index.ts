import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { StatusCodes } from 'http-status-codes'
import predictionsService from '../../services/predictions'
import openaiService from '../../services/openai'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { MODE } from '../../Interface'
import logger from '../../utils/logger'

/**
 * POST /api/v1/openai/chat/completions
 *
 * OpenAI-compatible chat completions endpoint.
 * Transforms the request into Chronos prediction format, executes the agentflow,
 * and returns the response in OpenAI ChatCompletion format.
 */
const chatCompletions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { model, messages, stream } = req.body

        if (!model) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, "'model' is required")
        }
        if (!messages || !Array.isArray(messages)) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, "'messages' must be a non-empty array")
        }

        // Resolve the agentflow
        const agentflow = await openaiService.resolveAgentflow(model)

        // Transform OpenAI messages to Chronos format
        const { question, history, systemMessage } = openaiService.transformMessages(messages)

        // Build the override config with system message if present
        const overrideConfig: Record<string, any> = req.body.x_chronos_override_config ?? {}
        if (systemMessage) {
            overrideConfig.systemMessage = systemMessage
        }

        // Build chatId from extension header or auto-generate
        const chatId = (req.headers['x-chat-id'] as string) ?? uuidv4()

        // Construct a synthetic request that the prediction service expects.
        // The prediction service reads req.params.id and req.body.
        // We mutate the original request object to preserve all Express internals
        // (headers, socket, protocol, etc.) that the prediction pipeline needs.
        req.params = { id: agentflow.id }
        req.body = {
            question,
            history,
            chatId,
            overrideConfig: Object.keys(overrideConfig).length > 0 ? overrideConfig : undefined,
            streaming: stream === true
        }
        const syntheticReq = req

        if (stream === true) {
            await handleStreamingResponse(syntheticReq, res, agentflow.id, chatId)
        } else {
            await handleNonStreamingResponse(syntheticReq, res, agentflow.id, chatId)
        }
    } catch (error) {
        next(error)
    }
}

/**
 * Non-streaming: call prediction service, wrap response in OpenAI format.
 */
const handleNonStreamingResponse = async (req: Request, res: Response, agentflowId: string, chatId: string) => {
    const predictionResult = await predictionsService.buildChatflow(req)

    const openaiResponse = openaiService.transformResponse(agentflowId, predictionResult)

    // Return chatId in extension header for session continuity
    res.setHeader('X-Chat-Id', chatId)
    res.json(openaiResponse)
}

/**
 * Streaming: set up SSE, intercept Chronos events, transform to OpenAI delta format.
 */
const handleStreamingResponse = async (req: Request, res: Response, agentflowId: string, chatId: string) => {
    const sseStreamer = getRunningExpressApp().sseStreamer
    const completionId = `chatcmpl-${uuidv4()}`

    // Override the SSE client's response with our OpenAI-format transformer
    // We intercept by writing directly to res, not using the default SSE client

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('X-Chat-Id', chatId)
    res.flushHeaders()

    // Send initial chunk with role
    res.write(openaiService.buildStreamChunk(completionId, agentflowId, { role: 'assistant' }))

    // Create a proxy response object that transforms Chronos SSE events to OpenAI format
    const proxyResponse = createStreamProxy(res, completionId, agentflowId)

    // Register with the SSE streamer using our proxy
    sseStreamer.addExternalClient(chatId, proxyResponse as any)

    if (process.env.MODE === MODE.QUEUE) {
        getRunningExpressApp().redisSubscriber.subscribe(chatId)
    }

    try {
        const apiResponse = await predictionsService.buildChatflow(req)
        sseStreamer.streamMetadataEvent(apiResponse.chatId, apiResponse)
    } catch (error) {
        const errorMsg = getErrorMessage(error)
        logger.error(`[OpenAI Compat] Streaming error: ${errorMsg}`)
        // Send error as a final chunk before closing
        const errorChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: agentflowId,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            error: { message: errorMsg }
        }
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
    } finally {
        sseStreamer.removeClient(chatId)
    }
}

/**
 * Creates a proxy Response object that intercepts SSE writes from Chronos's SSEStreamer
 * and transforms them into OpenAI-format streaming chunks.
 *
 * The SSEStreamer writes to client.response.write() in the format:
 *   message:\ndata:{"event":"token","data":"hello"}\n\n
 *
 * This proxy intercepts those writes and converts them to:
 *   data: {"id":"...","choices":[{"delta":{"content":"hello"}}]}\n\n
 */
function createStreamProxy(realRes: Response, completionId: string, agentflowId: string) {
    return {
        write: (chunk: string) => {
            // Parse the Chronos SSE event
            const dataMatch = chunk.match(/data:(.+)\n/)
            if (!dataMatch) return true

            try {
                const parsed = JSON.parse(dataMatch[1])
                const event = parsed.event
                const data = parsed.data

                switch (event) {
                    case 'token':
                        realRes.write(openaiService.buildStreamChunk(completionId, agentflowId, { content: data }))
                        break

                    case 'end':
                        // Send finish chunk then [DONE]
                        realRes.write(openaiService.buildStreamChunk(completionId, agentflowId, {}, 'stop'))
                        realRes.write('data: [DONE]\n\n')
                        realRes.end()
                        break

                    case 'error':
                        realRes.write(openaiService.buildStreamChunk(completionId, agentflowId, {}, 'stop'))
                        realRes.write('data: [DONE]\n\n')
                        realRes.end()
                        break

                    case 'abort':
                        realRes.write(openaiService.buildStreamChunk(completionId, agentflowId, {}, 'stop'))
                        realRes.write('data: [DONE]\n\n')
                        realRes.end()
                        break

                    // Chronos-specific events: drop in strict compat mode
                    case 'start':
                    case 'sourceDocuments':
                    case 'artifacts':
                    case 'usedTools':
                    case 'calledTools':
                    case 'fileAnnotations':
                    case 'tool':
                    case 'agentReasoning':
                    case 'nextAgent':
                    case 'agentFlowEvent':
                    case 'agentFlowExecutedData':
                    case 'nextAgentFlow':
                    case 'action':
                    case 'metadata':
                    case 'usageMetadata':
                        // Silently drop — not part of OpenAI spec
                        break

                    default:
                        // Unknown events are dropped
                        break
                }
            } catch {
                // Non-JSON writes (e.g. raw SSE) — skip
            }
            return true
        },
        end: () => {
            if (!realRes.writableEnded) {
                realRes.end()
            }
        },
        setHeader: realRes.setHeader.bind(realRes),
        flushHeaders: realRes.flushHeaders.bind(realRes)
    }
}

/**
 * GET /api/v1/openai/models
 */
const listModels = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await openaiService.listModels()
        return res.json(models)
    } catch (error) {
        next(error)
    }
}

/**
 * GET /api/v1/openai/models/:id
 */
const getModel = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Model ID is required')
        }
        const model = await openaiService.getModel(req.params.id)
        return res.json(model)
    } catch (error) {
        next(error)
    }
}

export default {
    chatCompletions,
    listModels,
    getModel
}
