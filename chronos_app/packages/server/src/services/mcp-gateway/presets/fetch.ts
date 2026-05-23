import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * Fetch MCP preset — wraps the official `mcp-server-fetch` (Python) over
 * stdio. Lets an agent retrieve and convert web content to a model-
 * friendly representation. Runs via `uvx` so the host running Chronos
 * must have `uv` installed and on the PATH; swap the command to
 * `python -m mcp_server_fetch` if installed system-wide. Takes no
 * credential.
 */
const fetchPreset: MCPPreset = {
    id: 'fetch',
    displayName: 'Fetch',
    description: 'Retrieve a URL and convert the response to a model-friendly text representation.',
    icon: 'fetch.svg',
    suggestedSlug: 'fetch',
    transport: MCPServerTransport.STDIO,
    command: 'uvx',
    args: ['mcp-server-fetch'],
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default fetchPreset
