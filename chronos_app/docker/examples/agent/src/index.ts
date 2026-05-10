import express from 'express'

const PORT = parseInt(process.env.PORT ?? '8001', 10)
// Per-agent token issued by Chronos when this agent is registered. Two ways
// the agent gets it:
//   1. Pre-configured: set MCP_GATEWAY_TOKEN at boot. Recommended for
//      high-sensitivity deployments that want to keep credentials out of
//      request headers.
//   2. In-band: Chronos injects `x-chronos-mcp-gateway-token` on every
//      forward request. Lets operators rotate the token from the UI without
//      restarting the agent — see the agent registry guide.
// Precedence: env wins. If MCP_GATEWAY_TOKEN is set, the header is ignored.
const MCP_GATEWAY_TOKEN = process.env.MCP_GATEWAY_TOKEN ?? ''

const stamp = () => new Date().toISOString()
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(`[example-agent ${stamp()}]`, ...args)

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
    // MCP_GATEWAY_TOKEN above for the rotation rationale.
    const gatewayToken = MCP_GATEWAY_TOKEN || (req.header('x-chronos-mcp-gateway-token') ?? '')

    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const userText = String(lastUser?.content ?? '')
    log(`chat/completions: callId=${callId ?? '(none)'} user=${JSON.stringify(userText)}`)
    const match = userText.match(/(\d+)\s*\+\s*(\d+)/)

    let assistantText: string
    if (match && mcpGatewayUrl && gatewayToken) {
        const a = parseInt(match[1], 10)
        const b = parseInt(match[2], 10)
        try {
            const gatewayResp = await fetch(mcpGatewayUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${gatewayToken}`
                },
                body: JSON.stringify({
                    tool: 'reference.add',
                    params: { a, b },
                    callId
                })
            })
            const json = (await gatewayResp.json().catch(() => ({}))) as Record<string, unknown>
            if (!gatewayResp.ok) {
                assistantText = `MCP gateway call failed (${gatewayResp.status}): ${JSON.stringify(json)}`
            } else {
                const result = (json.result ?? {}) as { content?: Array<{ type?: string; text?: string }> }
                const text = result.content?.find((c) => c?.type === 'text')?.text ?? JSON.stringify(result)
                assistantText = `${a} + ${b} = ${text}`
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
        `listening on :${PORT} (MCP gateway token ${MCP_GATEWAY_TOKEN ? 'configured via env' : 'will read x-chronos-mcp-gateway-token header per request'})`
    )
})
