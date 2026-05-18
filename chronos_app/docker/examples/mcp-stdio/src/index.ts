/**
 * Test fixture — tiny stdio MCP server used by the Chronos smoke runner to
 * exercise the spawn-and-pool path end-to-end. Speaks MCP over stdin/stdout
 * and exposes the same `echo` / `add` tool pair as the HTTP example so the
 * smoke runner can swap transports without retraining its assertions.
 *
 * NOT a reference MCP server. NOT recommended for use outside the smoke
 * suite. Public reference MCP servers live in `@modelcontextprotocol/server-*`
 * on npm — register those over stdio in Chronos for real integrations.
 *
 * Important: stdout is reserved for the JSON-RPC channel. Any diagnostic
 * output must go to stderr (see `log` helper below) — `console.log` to
 * stdout would corrupt the protocol stream and crash the client.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const stamp = () => new Date().toISOString()
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.error(`[mcp-stdio-fixture ${stamp()}]`, ...args)

const server = new McpServer({ name: 'chronos-stdio-fixture', version: '1.8.0' })

server.tool('echo', 'Echoes the input string back unchanged.', { message: z.string().describe('Message to echo') }, async ({ message }) => ({
    content: [{ type: 'text', text: message }]
}))

server.tool(
    'add',
    'Adds two integers and returns the sum as text.',
    { a: z.number().describe('First number'), b: z.number().describe('Second number') },
    async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] })
)

const transport = new StdioServerTransport()

server.connect(transport).then(
    () => log('stdio server ready'),
    (error: unknown) => {
        log('failed to connect transport', error)
        process.exit(1)
    }
)

process.on('SIGTERM', () => {
    log('received SIGTERM — exiting')
    process.exit(0)
})

process.on('SIGINT', () => {
    log('received SIGINT — exiting')
    process.exit(0)
})
