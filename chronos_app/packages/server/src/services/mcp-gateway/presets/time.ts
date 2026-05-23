import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * Time MCP preset — wraps `mcp-server-time` (Python) over stdio. Runs
 * via `uvx` so the host running Chronos must have `uv` installed and on
 * the PATH; switch the command to `python -m mcp_server_time` if the
 * package is already installed system-wide. Exposes current-time and
 * timezone-conversion tools; takes no credential.
 */
const timePreset: MCPPreset = {
    id: 'time',
    displayName: 'Time',
    description: 'Current-time and timezone-conversion utilities. Requires `uv` on the host PATH.',
    icon: 'time.svg',
    suggestedSlug: 'time',
    transport: MCPServerTransport.STDIO,
    command: 'uvx',
    args: ['mcp-server-time'],
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default timePreset
