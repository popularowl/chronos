/**
 * Tiny reference MCP server used by the v1.6 demo. Speaks Streamable HTTP
 * on /mcp. Exposes two tools — `echo` and `add` — sufficient to exercise
 * the Chronos MCP gateway end-to-end without depending on third-party
 * images that may bundle stdio-only entrypoints or fragile demo timers.
 *
 * Stateful session pattern (matches what the official mcp/everything image
 * does in SSE mode and what the MCP SDK's reference example does for
 * streamable-http): client posts an initialize request, server returns a
 * session id, subsequent calls reuse the session.
 */
import { randomUUID } from 'crypto'
import express, { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const PORT = parseInt(process.env.PORT ?? '7800', 10)

const stamp = () => new Date().toISOString()
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(`[mcp-reference ${stamp()}]`, ...args)

const buildServer = (): McpServer => {
    const server = new McpServer({ name: 'chronos-reference-mcp', version: '1.7.0' })

    server.tool(
        'echo',
        'Echoes the input string back unchanged.',
        { message: z.string().describe('Message to echo') },
        async ({ message }) => ({ content: [{ type: 'text', text: message }] })
    )

    server.tool(
        'add',
        'Adds two integers and returns the sum as text.',
        { a: z.number().describe('First number'), b: z.number().describe('Second number') },
        async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] })
    )

    return server
}

const app = express()
app.use(express.json({ limit: '4mb' }))

// One-line request log per inbound call so operators watching
// `docker compose logs mcp-reference` can see traffic arriving during demos.
// On POST we sniff the JSON-RPC envelope and surface the `method` (e.g.
// `initialize`, `tools/list`, `tools/call`) plus the tool name when present
// so the typical demo flow reads as a tight, narrated sequence in the logs.
app.use((req, _res, next) => {
    if (req.method === 'POST' && req.path === '/mcp' && req.body && typeof req.body === 'object') {
        const body = req.body as { method?: string; params?: { name?: string } }
        const method = typeof body.method === 'string' ? body.method : '(no method)'
        const toolName = method === 'tools/call' && typeof body.params?.name === 'string' ? ` tool=${body.params.name}` : ''
        const sid = req.header('mcp-session-id') ?? '(new)'
        log(`POST /mcp ${method}${toolName} session=${sid}`)
    } else {
        log(`${req.method} ${req.originalUrl}`)
    }
    next()
})

const transports = new Map<string, StreamableHTTPServerTransport>()

app.post('/mcp', async (req: Request, res: Response) => {
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
        const server = buildServer()
        await server.connect(newTransport)
        transport = newTransport
    }

    await transport.handleRequest(req, res, req.body)
})

// GET without a session id is what the MCPServerHealthPoller probes; return
// 200 so the server flips to HEALTHY on the first probe. With a session id
// present, this is the SSE listening channel — delegate.
app.get('/mcp', async (req: Request, res: Response) => {
    const sid = req.header('mcp-session-id')
    const transport = sid ? transports.get(sid) : undefined
    if (!transport) {
        res.status(200).json({ ok: true })
        return
    }
    await transport.handleRequest(req, res)
})

app.delete('/mcp', async (req: Request, res: Response) => {
    const sid = req.header('mcp-session-id')
    const transport = sid ? transports.get(sid) : undefined
    if (!transport) {
        res.status(400).send('No session')
        return
    }
    await transport.handleRequest(req, res)
})

app.listen(PORT, () => {
    log(`streamable-http listening on :${PORT}`)
})
