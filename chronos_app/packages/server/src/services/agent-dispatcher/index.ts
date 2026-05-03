import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { v4 as uuidv4 } from 'uuid'
import { Agent } from '../../database/entities/Agent'
import { AgentRuntimeType, MODE } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { utilBuildAgentflow } from '../../utils/buildAgentflow'
import httpAgentRuntime from '../agent-runtime-http'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Looks up an Agent by id (UUID) or slug. Used by the dispatcher and the
 * `/agents/:id/...` routes — accepting either lets callers address agents by
 * the same identifier they hand to the OpenAI `model` field.
 *
 * The UUID regex check is required: Postgres's uuid column type rejects
 * non-UUID strings at the SQL layer, throwing before TypeORM can return
 * null. SQLite tolerates the type mismatch and would silently fall through.
 * Gating on the regex keeps the behaviour identical across both dialects.
 */
const findAgent = async (idOrSlug: string): Promise<Agent | null> => {
    const repo = getRunningExpressApp().AppDataSource.getRepository(Agent)
    if (UUID_RE.test(idOrSlug)) {
        const byId = await repo.findOneBy({ id: idOrSlug })
        if (byId) return byId
    }
    return await repo.findOneBy({ slug: idOrSlug })
}

const isStreamingRequested = (body: any): boolean => body?.streaming === true || body?.streaming === 'true' || body?.stream === true

/**
 * Runs the BUILT_IN branch of the dispatcher. Mirrors the streaming setup of
 * the existing `predictions` controller: SSE headers + sseStreamer client
 * registration go up before `utilBuildAgentflow` runs so the engine can
 * stream tokens back live. Non-streaming returns the raw result for the
 * caller to `res.json`.
 */
const dispatchBuiltIn = async (req: Request, res: Response, agent: Agent): Promise<any> => {
    if (!agent.builtinAgentflowId) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `BUILT_IN agent '${agent.slug}' has no underlying agentflow`)
    }

    req.params = { ...req.params, id: agent.builtinAgentflowId }

    if (!isStreamingRequested(req.body)) {
        return await utilBuildAgentflow(req)
    }

    const sseStreamer = getRunningExpressApp().sseStreamer
    const chatId = req.body?.chatId ?? req.body?.overrideConfig?.sessionId ?? uuidv4()
    req.body = { ...req.body, chatId }

    try {
        sseStreamer.addExternalClient(chatId, res)
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        if (process.env.MODE === MODE.QUEUE) {
            getRunningExpressApp().redisSubscriber.subscribe(chatId)
        }

        const result = await utilBuildAgentflow(req)
        sseStreamer.streamMetadataEvent(result.chatId, result)
        return undefined
    } catch (error) {
        if (chatId) sseStreamer.streamErrorEvent(chatId, getErrorMessage(error))
        throw error
    } finally {
        sseStreamer.removeClient(chatId)
    }
}

/**
 * Uniform agent invocation entry point. Branches on `runtimeType`:
 *  - `BUILT_IN` — delegates to `dispatchBuiltIn`. Handles SSE setup for
 *    streaming requests; returns the raw result for non-streaming so the
 *    caller can `res.json` it.
 *  - `HTTP` — delegates to `HttpAgentRuntime.invoke`, which always writes
 *    directly to `res` (streaming pass-through or JSON).
 *
 * Locked decision #4: this is the single dispatch surface — both runtime
 * types reach `/api/v1/agents/:id/invoke` and behave identically.
 */
const dispatch = async (req: Request, res: Response, idOrSlug: string): Promise<any> => {
    if (process.env.ENABLE_AGENTS !== 'true') {
        throw new InternalChronosError(StatusCodes.SERVICE_UNAVAILABLE, 'Agents are not enabled. Set ENABLE_AGENTS=true to enable them.')
    }

    const agent = await findAgent(idOrSlug)
    if (!agent) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent '${idOrSlug}' not found`)
    }
    if (!agent.enabled) {
        throw new InternalChronosError(StatusCodes.CONFLICT, `Agent '${idOrSlug}' is disabled`)
    }

    if (agent.runtimeType === AgentRuntimeType.BUILT_IN) {
        return await dispatchBuiltIn(req, res, agent)
    }
    if (agent.runtimeType === AgentRuntimeType.HTTP) {
        await httpAgentRuntime.invoke(agent, req.body || {}, req, res)
        return undefined
    }

    throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Unknown runtimeType '${agent.runtimeType}'`)
}

export default {
    dispatch,
    findAgent
}
