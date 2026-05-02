/**
 * v1.6 smoke test runner. Boots an embedded Streamable-HTTP MCP server
 * (one tool: `add`) and a tiny agent /health stub, then drives a real
 * callback round-trip against a running Chronos instance.
 *
 * The "agent" half does not implement /v1/chat/completions — the test
 * driver calls /api/v1/agent-callbacks/:agentId/tools/invoke directly
 * with the agent's auto-generated callback token. That path exercises:
 *
 *   - Agent + MCP server registration via the UI API
 *   - Callback bearer auth (constant-time compare)
 *   - allowedTools intersection (Agent ∩ MCPServer)
 *   - Pooled MCP client connection (Streamable HTTP transport)
 *   - tools/call against a real MCP server with assertion on the result
 *
 * Exit codes: 0 pass, 1 assertion failure, 2 unexpected crash.
 */
import { randomUUID } from 'crypto'
import express, { Request, Response as ExpressResponse } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const CHRONOS_BASE_URL = process.env.CHRONOS_BASE_URL ?? 'http://chronos:3000'
const CHRONOS_USER_EMAIL = process.env.CHRONOS_USER_EMAIL ?? 'admin@admin.com'
const CHRONOS_USER_PASSWORD = process.env.CHRONOS_USER_PASSWORD ?? 'test1234'
const MCP_BIND_PORT = parseInt(process.env.MCP_BIND_PORT ?? '7800', 10)
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://smoke-runner:${MCP_BIND_PORT}/mcp`
const AGENT_BIND_PORT = parseInt(process.env.AGENT_BIND_PORT ?? '8001', 10)
const AGENT_PUBLIC_URL = process.env.AGENT_PUBLIC_URL ?? `http://smoke-runner:${AGENT_BIND_PORT}`

// ─────────────────────── embedded MCP server ───────────────────────

const buildMcpServer = (): McpServer => {
    const server = new McpServer({ name: 'smoke-mcp', version: '1.6.0' })
    server.tool(
        'add',
        'Adds two integers and returns the sum as text.',
        { a: z.number(), b: z.number() },
        async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] })
    )
    return server
}

const startMcpServer = (): Promise<void> => {
    const app = express()
    app.use(express.json({ limit: '4mb' }))

    const transports = new Map<string, StreamableHTTPServerTransport>()

    app.post('/mcp', async (req: Request, res: ExpressResponse) => {
        const existingId = req.header('mcp-session-id')
        let transport = existingId ? transports.get(existingId) : undefined

        if (!transport) {
            const newTransport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (id: string) => {
                    transports.set(id, newTransport)
                }
            })
            newTransport.onclose = () => {
                if (newTransport.sessionId) transports.delete(newTransport.sessionId)
            }
            const mcp = buildMcpServer()
            await mcp.connect(newTransport)
            transport = newTransport
        }

        await transport.handleRequest(req, res, req.body)
    })

    // GET without a session ID is the path the MCPServerHealthPoller probes.
    // Return a vanilla 200 so the poller marks the server HEALTHY. With a
    // session ID present, this is the SSE listening channel — delegate.
    app.get('/mcp', async (req: Request, res: ExpressResponse) => {
        const sid = req.header('mcp-session-id')
        const transport = sid ? transports.get(sid) : undefined
        if (!transport) {
            res.status(200).json({ ok: true })
            return
        }
        await transport.handleRequest(req, res)
    })

    app.delete('/mcp', async (req: Request, res: ExpressResponse) => {
        const sid = req.header('mcp-session-id')
        const transport = sid ? transports.get(sid) : undefined
        if (!transport) {
            res.status(400).send('No session')
            return
        }
        await transport.handleRequest(req, res)
    })

    return new Promise((resolve) => {
        app.listen(MCP_BIND_PORT, () => {
            // eslint-disable-next-line no-console
            console.log(`[smoke-mcp] streamable-http listening on :${MCP_BIND_PORT}`)
            resolve()
        })
    })
}

// ───────────────────── agent /health stub ─────────────────────

const startAgentStub = (): Promise<void> => {
    const app = express()
    app.use(express.json({ limit: '1mb' }))
    app.get('/health', (_req, res) => res.json({ ok: true }))
    app.post('/v1/chat/completions', (_req, res) =>
        res.status(501).json({ error: 'agent endpoint not exercised by smoke test' })
    )
    return new Promise((resolve) => {
        app.listen(AGENT_BIND_PORT, () => {
            // eslint-disable-next-line no-console
            console.log(`[smoke-agent] /health listening on :${AGENT_BIND_PORT}`)
            resolve()
        })
    })
}

// ────────────────────────── test driver ──────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const waitForChronos = async (maxAttempts = 60): Promise<void> => {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const r = await fetch(`${CHRONOS_BASE_URL}/api/v1/ping`)
            if (r.ok) return
        } catch {
            /* not yet */
        }
        await sleep(2000)
    }
    throw new Error(`chronos at ${CHRONOS_BASE_URL} did not come up within ${maxAttempts * 2}s`)
}

const login = async (): Promise<string> => {
    const resp = await fetch(`${CHRONOS_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: CHRONOS_USER_EMAIL, password: CHRONOS_USER_PASSWORD })
    })
    if (!resp.ok) throw new Error(`login failed: ${resp.status} ${await resp.text()}`)
    const body = (await resp.json()) as { token?: string }
    if (!body?.token) throw new Error(`login response missing token: ${JSON.stringify(body)}`)
    return body.token
}

const authedJson = async (token: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${token}`)
    // Chronos's global middleware routes /api/v1/* through JWT verification only
    // when the request advertises itself as coming from the UI. Without this,
    // requests are treated as external and require a Chronos API key. The UI
    // itself sets the same header on every call.
    headers.set('x-request-from', 'internal')
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    return fetch(`${CHRONOS_BASE_URL}${path}`, { ...init, headers })
}

const runDriver = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[driver] waiting for chronos at ${CHRONOS_BASE_URL} ...`)
    await waitForChronos()

    // eslint-disable-next-line no-console
    console.log(`[driver] logging in as ${CHRONOS_USER_EMAIL}`)
    const token = await login()

    // 1. register MCP server
    // eslint-disable-next-line no-console
    console.log(`[driver] registering MCP server slug=smoke url=${MCP_PUBLIC_URL}`)
    const mcpResp = await authedJson(token, '/api/v1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Smoke MCP',
            slug: 'smoke',
            transport: 'streamable-http',
            url: MCP_PUBLIC_URL,
            allowedTools: ['add'],
            timeoutMs: 10000
        })
    })
    if (!mcpResp.ok) throw new Error(`register mcp failed: ${mcpResp.status} ${await mcpResp.text()}`)
    const mcp = (await mcpResp.json()) as { id: string; slug: string }
    // eslint-disable-next-line no-console
    console.log(`[driver] MCP registered id=${mcp.id} slug=${mcp.slug}`)

    // 2. register HTTP agent
    // eslint-disable-next-line no-console
    console.log(`[driver] registering HTTP agent slug=smoke-agent serviceEndpoint=${AGENT_PUBLIC_URL}`)
    const agentResp = await authedJson(token, '/api/v1/agents', {
        method: 'POST',
        body: JSON.stringify({
            name: 'Smoke Agent',
            slug: 'smoke-agent',
            runtimeType: 'HTTP',
            serviceEndpoint: AGENT_PUBLIC_URL,
            allowedTools: ['smoke.add'],
            runtimeConfig: { healthEndpoint: `${AGENT_PUBLIC_URL}/health`, timeoutMs: 30000 }
        })
    })
    if (!agentResp.ok) throw new Error(`register agent failed: ${agentResp.status} ${await agentResp.text()}`)
    const agent = (await agentResp.json()) as { id: string; slug: string; callbackToken?: string }
    if (!agent.callbackToken) throw new Error(`agent response missing callbackToken: ${JSON.stringify(agent)}`)
    // eslint-disable-next-line no-console
    console.log(`[driver] agent registered id=${agent.id} slug=${agent.slug}`)

    // 3. round-trip: agent → callback → gateway → MCP server → result
    // eslint-disable-next-line no-console
    console.log(`[driver] invoking smoke.add via /agent-callbacks/${agent.id}/tools/invoke`)
    const callResp = await fetch(`${CHRONOS_BASE_URL}/api/v1/agent-callbacks/${agent.id}/tools/invoke`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${agent.callbackToken}`
        },
        body: JSON.stringify({
            tool: 'smoke.add',
            params: { a: 2, b: 3 },
            callId: 'smoke-test-1'
        })
    })
    const callBody = (await callResp.json().catch(() => ({}))) as {
        success?: boolean
        result?: { content?: Array<{ type?: string; text?: string }> }
        error?: string
    }
    if (!callResp.ok) throw new Error(`callback HTTP ${callResp.status}: ${JSON.stringify(callBody)}`)
    if (callBody.success !== true) throw new Error(`callback success!=true: ${JSON.stringify(callBody)}`)
    const text = callBody.result?.content?.find((c) => c?.type === 'text')?.text
    if (text !== '5') {
        throw new Error(`expected result text "5", got ${JSON.stringify(callBody.result)}`)
    }

    // eslint-disable-next-line no-console
    console.log(`[driver] OK — round-trip verified: 2 + 3 = ${text}`)
}

// ──────────────────────────── boot ────────────────────────────

const main = async (): Promise<void> => {
    await Promise.all([startMcpServer(), startAgentStub()])
    try {
        await runDriver()
        // eslint-disable-next-line no-console
        console.log('[smoke] PASS')
        process.exit(0)
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[smoke] FAIL:', (err as Error).message ?? err)
        process.exit(1)
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[smoke] crash:', err)
    process.exit(2)
})
