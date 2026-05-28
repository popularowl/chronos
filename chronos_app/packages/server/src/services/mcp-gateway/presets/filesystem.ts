import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * Filesystem MCP preset — wraps `@modelcontextprotocol/server-filesystem`
 * over stdio. Exposes read/write file tools scoped to the directories
 * passed as positional args; that path list is the security boundary, so
 * the Chronos user edits the prefilled `/data/agent-workspace` to the
 * directory the agent may reach. Takes no credential — access is bounded
 * by the args and the OS permissions of the user Chronos runs as. Spawned
 * via `npx`, so the host needs Node on the PATH.
 */
const filesystemPreset: MCPPreset = {
    id: 'filesystem',
    displayName: 'Filesystem',
    description: 'Read and write files within directories you allow. Edit the path argument to the directory the agent may access.',
    icon: 'filesystem.svg',
    suggestedSlug: 'filesystem',
    transport: MCPServerTransport.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/data/agent-workspace'],
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default filesystemPreset
