import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * SQLite MCP preset — wraps the Python `mcp-server-sqlite`, run via `uvx`,
 * so the host running Chronos must have `uv` installed and on the PATH
 * (the catalogue greys the card out otherwise). Exposes query + schema
 * tools (read_query, write_query, list_tables, describe_table,
 * create_table) backed by a single database file; the Chronos user edits
 * the prefilled `--db-path` to point at their SQLite file. Takes no
 * credential — access is bounded by the file and the OS permissions of the
 * user Chronos runs as.
 */
const sqlitePreset: MCPPreset = {
    id: 'sqlite',
    displayName: 'SQLite',
    description: 'SQL query and schema tools over a SQLite database file. Edit the --db-path argument to your database. Requires `uv` on the host PATH.',
    icon: 'sqlite.svg',
    suggestedSlug: 'sqlite',
    transport: MCPServerTransport.STDIO,
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', '/data/demo.db'],
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default sqlitePreset
