import express from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema, ListToolsResultSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

const PORT = parseInt(process.env.PORT ?? '8001', 10)

/**
 * Per-agent MCP gateway token issued by Chronos at registration. Two ways the
 * agent gets it:
 *   1. Pre-configured: set MCP_GATEWAY_TOKEN at boot. Recommended for
 *      high-sensitivity deployments that want credentials out of request
 *      headers entirely.
 *   2. In-band: Chronos injects `x-chronos-mcp-gateway-token` on every
 *      forward request. Lets operators rotate the token from the UI without
 *      restarting the agent — see the agent registry guide.
 * Precedence: env wins. If MCP_GATEWAY_TOKEN is set, the header is ignored.
 */
const ENV_GATEWAY_TOKEN = process.env.MCP_GATEWAY_TOKEN ?? ''

const stamp = () => new Date().toISOString()
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(`[example-agent ${stamp()}]`, ...args)

interface CachedSession {
    client: Client
    toolNames: Set<string>
    closed: boolean
}

/**
 * Cache one MCP `Client` per `(gatewayUrl, token)` pair. The MCP session
 * survives across chat-completion requests so the agent doesn't pay the
 * `initialize` handshake cost on every call. A `notifications/tools/list_changed`
 * push refreshes `toolNames` in place; a transport close drops the entry so
 * the next request reconnects.
 */
const sessions = new Map<string, Promise<CachedSession>>()

const cacheKey = (url: string, token: string): string => `${url}::${token}`

const refreshToolNames = async (session: CachedSession): Promise<void> => {
    const result = await session.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema)
    session.toolNames = new Set(result.tools.map((t) => t.name))
    log(`tools/list refreshed (${session.toolNames.size} tool(s))`)
}

/**
 * Open an MCP Streamable HTTP session against Chronos and prime the tool
 * catalog. Subscribes to `notifications/tools/list_changed` so the cached
 * `toolNames` set stays current when operators edit `Agent.allowedTools` or
 * any registered MCP server. The transport-close hook clears the cache entry
 * on disconnect so subsequent calls reconnect.
 */
const openSession = async (gatewayUrl: string, token: string): Promise<CachedSession> => {
    const transport = new StreamableHTTPClientTransport(new URL(gatewayUrl), {
        requestInit: { headers: { authorization: `Bearer ${token}` } }
    })
    const client = new Client({ name: 'chronos-example-agent', version: '1.8.0' }, { capabilities: {} })

    const session: CachedSession = { client, toolNames: new Set(), closed: false }

    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        log('received notifications/tools/list_changed')
        try {
            await refreshToolNames(session)
        } catch (err) {
            log(`tools/list refresh failed: ${(err as Error).message ?? String(err)}`)
        }
    })

    transport.onclose = () => {
        session.closed = true
        sessions.delete(cacheKey(gatewayUrl, token))
        log('MCP session closed')
    }

    await client.connect(transport)
    await refreshToolNames(session)
    log(`MCP session established at ${gatewayUrl}`)
    return session
}

const getSession = async (gatewayUrl: string, token: string): Promise<CachedSession> => {
    const key = cacheKey(gatewayUrl, token)
    const existing = sessions.get(key)
    if (existing) {
        const session = await existing
        if (!session.closed) return session
    }
    const promise = openSession(gatewayUrl, token).catch((err) => {
        sessions.delete(key)
        throw err
    })
    sessions.set(key, promise)
    return promise
}

const app = express()
app.use(express.json({ limit: '10mb' }))

// One-line request log per inbound call so operators watching `docker compose
// logs example-agent` can see traffic arriving during demos.
app.use((req, _res, next) => {
    log(`${req.method} ${req.originalUrl}`)
    next()
})

app.get('/health', (_req, res) => {
    res.json({ ok: true })
})

app.post('/v1/chat/completions', async (req, res) => {
    const body = req.body ?? {}
    const messages: Array<{ role?: string; content?: string }> = Array.isArray(body.messages) ? body.messages : []
    const mcpGatewayUrl: string | undefined = req.header('x-chronos-mcp-gateway-url') ?? undefined
    const callId: string | undefined = body.x_chronos_call_id ?? (req.header('x-chronos-call-id') ?? undefined)
    // Env wins; fall back to the per-request header. See the comment on
    // ENV_GATEWAY_TOKEN above for the rotation rationale.
    const gatewayToken = ENV_GATEWAY_TOKEN || (req.header('x-chronos-mcp-gateway-token') ?? '')

    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const userText = String(lastUser?.content ?? '')
    log(`chat/completions: callId=${callId ?? '(none)'} user=${JSON.stringify(userText)}`)
    const match = userText.match(/(\d+)\s*\+\s*(\d+)/)

    let assistantText: string
    if (match && mcpGatewayUrl && gatewayToken) {
        const a = parseInt(match[1], 10)
        const b = parseInt(match[2], 10)
        try {
            const session = await getSession(mcpGatewayUrl, gatewayToken)
            const toolName = 'reference.add'
            if (!session.toolNames.has(toolName)) {
                assistantText = `Tool ${toolName} is not in this agent's allowed catalog (have: ${[...session.toolNames].join(', ') || '(empty)'})`
            } else {
                const result = await session.client.request(
                    {
                        method: 'tools/call',
                        params: {
                            name: toolName,
                            arguments: { a, b },
                            _meta: callId ? { chronosCallId: callId } : undefined
                        }
                    },
                    CallToolResultSchema
                )
                if (result.isError) {
                    const errText = result.content.find((c) => c.type === 'text')?.text ?? 'tool reported an error'
                    assistantText = `MCP tool ${toolName} failed: ${errText}`
                } else {
                    const text = result.content.find((c) => c.type === 'text')?.text ?? JSON.stringify(result)
                    assistantText = `${a} + ${b} = ${text}`
                }
            }
        } catch (err) {
            assistantText = `MCP gateway call error: ${(err as Error).message ?? String(err)}`
        }
    } else if (match && !gatewayToken) {
        assistantText = `No gateway token available — set MCP_GATEWAY_TOKEN env or expect the x-chronos-mcp-gateway-token header from Chronos. Echo: ${userText}`
    } else {
        assistantText = `Echo: ${userText}`
    }

    log(`chat/completions: replying assistant=${JSON.stringify(assistantText)}`)

    res.json({
        id: `chatcmpl-${callId ?? Math.random().toString(36).slice(2)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'example-agent',
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: assistantText },
                finish_reason: 'stop'
            }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    })
})

app.listen(PORT, () => {
    log(
        `listening on :${PORT} (MCP gateway token ${ENV_GATEWAY_TOKEN ? 'configured via env' : 'will read x-chronos-mcp-gateway-token header per request'})`
    )
})
