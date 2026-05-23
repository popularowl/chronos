import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * Memory MCP preset — wraps `@modelcontextprotocol/server-memory` over
 * stdio. Provides a small in-process knowledge-graph store so an agent
 * can persist facts across turns. Takes no credential; the store lives
 * for the lifetime of the spawned child.
 */
const memoryPreset: MCPPreset = {
    id: 'memory',
    displayName: 'Memory',
    description: 'In-process knowledge-graph store an agent can write to and recall across turns.',
    icon: 'memory.svg',
    suggestedSlug: 'memory',
    transport: MCPServerTransport.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default memoryPreset
