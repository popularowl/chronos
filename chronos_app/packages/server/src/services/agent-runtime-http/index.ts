import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { v4 as uuidv4 } from 'uuid'
import { Agent } from '../../database/entities/Agent'
import { Credential } from '../../database/entities/Credential'
import { Execution } from '../../database/entities/Execution'
import { ExecutionMetrics } from '../../database/entities/ExecutionMetrics'
import { ExecutionState } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { decryptCredentialData } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import logger from '../../utils/logger'
import { ensureFreshAccessToken } from '../credentials/oauth2-refresh'

const DEFAULT_HTTP_TIMEOUT_MS = 60000

/**
 * Resolves outbound auth credentials into a header pair, supporting both
 * inline secrets and `Credential`-vault references.
 *
 * Supported shapes:
 *   { type: 'bearer', token: '...' }
 *   { type: 'bearer', credentialId: '...', tokenField?: 'apiKey' }
 *   { type: 'header', name: 'X-Token', value: '...' }
 *   { type: 'header', name: 'X-Token', credentialId: '...', valueField?: 'apiKey' }
 *   { type: 'oauth2-refresh', credentialId: '...' }   (v1.8.0 Group B)
 */
const resolveOutboundAuth = async (outboundAuth?: string): Promise<Record<string, string>> => {
    if (!outboundAuth) return {}
    let parsed: any
    try {
        parsed = typeof outboundAuth === 'string' ? JSON.parse(outboundAuth) : outboundAuth
    } catch {
        return {}
    }
    if (!parsed || typeof parsed !== 'object') return {}

    const fetchSecret = async (credentialId: string, field?: string): Promise<string | undefined> => {
        const appServer = getRunningExpressApp()
        const credential = await appServer.AppDataSource.getRepository(Credential).findOneBy({ id: credentialId })
        if (!credential) return undefined
        // v1.7 § 3d: emit a credential-access audit row tagged with the runtime
        // path. agentId / userId aren't on the resolveOutboundAuth signature
        // today; threading them through is a follow-up under § 4 carve-outs.
        const decrypted = await decryptCredentialData(credential.encryptedData, undefined, undefined, {
            credentialId,
            source: 'agent-runtime-http.outbound-auth'
        })
        const key = field ?? Object.keys(decrypted)[0]
        const value = key ? decrypted[key] : undefined
        return typeof value === 'string' ? value : undefined
    }

    if (parsed.type === 'bearer') {
        const token = parsed.token ?? (parsed.credentialId ? await fetchSecret(parsed.credentialId, parsed.tokenField) : undefined)
        if (!token) return {}
        return { Authorization: `Bearer ${token}` }
    }

    if (parsed.type === 'header' && typeof parsed.name === 'string') {
        const value = parsed.value ?? (parsed.credentialId ? await fetchSecret(parsed.credentialId, parsed.valueField) : undefined)
        if (!value) return {}
        return { [parsed.name]: value }
    }

    if (parsed.type === 'oauth2-refresh' && typeof parsed.credentialId === 'string') {
        const accessToken = await ensureFreshAccessToken({ credentialId: parsed.credentialId })
        return { Authorization: 'Bearer ' + accessToken }
    }

    return {}
}

/**
 * Writes an Execution row to mark the start of an HTTP-agent invocation.
 * `agentflowId` is the Agent.id so dashboard queries can correlate executions
 * back to the registered agent (locked decision #4 — single uniform shape).
 */
const writeStartExecution = async (agent: Agent, sessionId: string, executionData: object): Promise<Execution | null> => {
    try {
        const appServer = getRunningExpressApp()
        const execution = appServer.AppDataSource.getRepository(Execution).create({
            agentflowId: agent.id,
            state: 'INPROGRESS' as ExecutionState,
            sessionId,
            executionData: JSON.stringify(executionData)
        })
        return await appServer.AppDataSource.getRepository(Execution).save(execution)
    } catch (error) {
        logger.warn(`[HttpAgentRuntime] Failed to record start execution for agent ${agent.id}: ${getErrorMessage(error)}`)
        return null
    }
}

/**
 * Updates the Execution row to a terminal state and writes the matching
 * ExecutionMetrics row. Surfaces upstream OpenAI token usage when present —
 * Chat Completions emits prompt_tokens/completion_tokens, the Responses API
 * emits input_tokens/output_tokens; both carry total_tokens. Streaming
 * responses are piped raw, so usage is captured only on the non-streaming
 * success path; streamed runs land at zero until SSE usage extraction is in
 * scope.
 */
const writeFinishExecution = async (
    execution: Execution | null,
    agent: Agent,
    state: ExecutionState,
    durationMs: number,
    finalPayload: object
): Promise<void> => {
    if (!execution) return
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Execution)
        execution.state = state
        // Merge start-phase fields (callId, request) with the finish payload.
        // Without the merge, executionData = JSON.stringify(finalPayload) would
        // clobber `request` (persisted by writeStartExecution) on every finish,
        // breaking the UI's "Request to {agent}" tree child which reads
        // `payload.request` to render the OpenAI ChatCompletion body Chronos
        // POSTed. Finish-phase keys (response / error / statusCode / streamed
        // / aborted / body) don't collide with start-phase keys, so order
        // doesn't matter — but we put finalPayload last for explicitness.
        let startData: Record<string, unknown> = {}
        try {
            const parsed = execution.executionData ? JSON.parse(execution.executionData) : {}
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) startData = parsed as Record<string, unknown>
        } catch {
            startData = {}
        }
        execution.executionData = JSON.stringify({ ...startData, ...(finalPayload as Record<string, unknown>) })
        await repo.save(execution)

        const usage = (finalPayload as any)?.response?.usage ?? {}
        const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0
        const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0
        const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens) || 0

        const metricsRepo = appServer.AppDataSource.getRepository(ExecutionMetrics)
        const metrics = metricsRepo.create({
            agentflowId: agent.id,
            executionId: execution.id,
            state: state === 'FINISHED' ? 'FINISHED' : 'ERROR',
            durationMs,
            triggerType: 'api',
            inputTokens,
            outputTokens,
            totalTokens
        })
        await metricsRepo.save(metrics)
    } catch (error) {
        logger.warn(`[HttpAgentRuntime] Failed to record finish execution for agent ${agent.id}: ${getErrorMessage(error)}`)
    }
}

/**
 * Reads runtime config (timeoutMs, requestHeaders) from the agent's stored
 * runtimeConfig blob. Defaults applied when keys are missing.
 */
const parseRuntimeConfig = (agent: Agent): { timeoutMs: number; requestHeaders: Record<string, string>; healthEndpoint?: string } => {
    let cfg: any = {}
    if (agent.runtimeConfig) {
        try {
            cfg = JSON.parse(agent.runtimeConfig)
        } catch {
            cfg = {}
        }
    }
    return {
        timeoutMs: typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : DEFAULT_HTTP_TIMEOUT_MS,
        requestHeaders: cfg.requestHeaders && typeof cfg.requestHeaders === 'object' ? cfg.requestHeaders : {},
        healthEndpoint: cfg.healthEndpoint
    }
}

/**
 * Builds the absolute MCP gateway URL the agent should connect to for tool
 * discovery + invocation. Sent on every chat-completions forward as the
 * `x-chronos-mcp-gateway-url` header — header-only by design so the body
 * stays a clean OpenAI envelope.
 *
 * The URL is the MCP Streamable HTTP entry point: agents open an MCP session
 * here using `@modelcontextprotocol/sdk` (or any compliant client) and run
 * `tools/list` + `tools/call` over standard MCP transport.
 */
const buildMcpGatewayUrl = (req: Request, agentId: string): string => {
    const httpProtocol = req.get('x-forwarded-proto') || req.protocol
    const baseURL = `${httpProtocol}://${req.get('host')}`
    return `${baseURL}/api/v1/mcp-gateway/${agentId}`
}

const joinUrl = (base: string, path: string): string => {
    if (!base) return path
    return base.endsWith('/') ? base.slice(0, -1) + path : base + path
}

/**
 * Pipe an upstream `Response.body` (Web ReadableStream) chunk-by-chunk to the
 * Express response. Flush after each chunk so SSE consumers see tokens in
 * near-real-time even when an intermediate proxy buffers small writes.
 */
const pipeStreamingBody = async (upstream: globalThis.Response, res: Response): Promise<void> => {
    if (!upstream.body) {
        res.end()
        return
    }
    const reader = upstream.body.getReader()
    try {
        let done = false
        while (!done) {
            const chunk = await reader.read()
            done = chunk.done
            if (!done && chunk.value && chunk.value.length > 0) {
                res.write(Buffer.from(chunk.value))
                ;(res as any).flush?.()
            }
        }
    } finally {
        try {
            reader.releaseLock()
        } catch {
            /* noop */
        }
        if (!res.writableEnded) res.end()
    }
}

/**
 * Invoke an HTTP-runtime agent. Forwards an OpenAI-style chat completions
 * request to `agent.serviceEndpoint/v1/chat/completions`, with outbound auth,
 * Chronos extension headers, and optional SSE pass-through. Records an
 * Execution + ExecutionMetrics row keyed by `agent.id`.
 */
const invoke = async (agent: Agent, openaiRequest: any, req: Request, res: Response): Promise<void> => {
    if (!agent.serviceEndpoint) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'HTTP agent has no serviceEndpoint configured')
    }

    const { timeoutMs, requestHeaders } = parseRuntimeConfig(agent)
    const authHeaders = await resolveOutboundAuth(agent.outboundAuth)
    const callId = uuidv4()
    const mcpGatewayUrl = buildMcpGatewayUrl(req, agent.id)
    const sessionId = (req.headers['x-chat-id'] as string) || openaiRequest?.x_chronos_chat_id || uuidv4()

    // Body stays OpenAI-shaped. The gateway URL is metadata about the request,
    // not part of its semantic payload — it goes only in the
    // `x-chronos-mcp-gateway-url` header below.
    const forwardBody = {
        ...openaiRequest,
        x_chronos_call_id: callId
    }

    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: openaiRequest?.stream === true ? 'text/event-stream' : 'application/json',
        'x-chronos-call-id': callId,
        'x-chronos-mcp-gateway-url': mcpGatewayUrl,
        ...requestHeaders,
        ...authHeaders
    }
    // In-band gateway token: lets agents pick up rotations without a restart.
    // Header form so it falls under the same redaction conventions as
    // Authorization in most observability stacks. Agents that prefer the
    // pre-configured env var can ignore this header — see
    // docker/examples/agent for the reference precedence (env wins).
    if (agent.mcpGatewayToken) {
        headers['x-chronos-mcp-gateway-token'] = agent.mcpGatewayToken
    }

    const startedAt = Date.now()
    const execution = await writeStartExecution(agent, sessionId, { callId, request: openaiRequest })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const url = joinUrl(agent.serviceEndpoint, '/v1/chat/completions')

    let upstream: globalThis.Response
    try {
        upstream = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(forwardBody),
            signal: controller.signal
        })
    } catch (error) {
        clearTimeout(timer)
        const isAbort = (error as any)?.name === 'AbortError'
        await writeFinishExecution(execution, agent, 'ERROR' as ExecutionState, Date.now() - startedAt, {
            error: getErrorMessage(error),
            aborted: isAbort
        })
        if (isAbort) {
            throw new InternalChronosError(StatusCodes.GATEWAY_TIMEOUT, `HTTP agent ${agent.slug} timed out after ${timeoutMs}ms`)
        }
        throw new InternalChronosError(StatusCodes.BAD_GATEWAY, `HTTP agent ${agent.slug} unreachable: ${getErrorMessage(error)}`)
    }
    clearTimeout(timer)

    if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        await writeFinishExecution(execution, agent, 'ERROR' as ExecutionState, Date.now() - startedAt, {
            statusCode: upstream.status,
            body: text.slice(0, 4000)
        })
        throw new InternalChronosError(
            StatusCodes.BAD_GATEWAY,
            `HTTP agent ${agent.slug} returned ${upstream.status}: ${text.slice(0, 500)}`
        )
    }

    if (openaiRequest?.stream === true) {
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.setHeader('X-Chat-Id', sessionId)
        res.flushHeaders()
        try {
            await pipeStreamingBody(upstream, res)
            await writeFinishExecution(execution, agent, 'FINISHED' as ExecutionState, Date.now() - startedAt, { streamed: true })
        } catch (error) {
            await writeFinishExecution(execution, agent, 'ERROR' as ExecutionState, Date.now() - startedAt, {
                error: getErrorMessage(error)
            })
            if (!res.writableEnded) res.end()
        }
        return
    }

    const payload = await upstream.json().catch(() => ({}))
    res.setHeader('X-Chat-Id', sessionId)
    await writeFinishExecution(execution, agent, 'FINISHED' as ExecutionState, Date.now() - startedAt, { response: payload })
    res.json(payload)
}

export default {
    invoke,
    resolveOutboundAuth
}
