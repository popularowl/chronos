import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * PostgreSQL MCP preset — wraps `@modelcontextprotocol/server-postgres`
 * over stdio. The connection URL is passed as the third argv string,
 * sourced from the Chronos user's `PostgresUrl` credential (`postgresUrl`
 * field). The UI substitutes the credential marker with a
 * `{{credentialId:postgresUrl}}` token at instantiation; the gateway's
 * stdio resolver decrypts the URL at spawn time so the row never holds
 * the connection string in plaintext.
 */
const postgresqlPreset: MCPPreset = {
    id: 'postgresql',
    displayName: 'PostgreSQL',
    description: 'Read-only SQL query and schema introspection over a Postgres database.',
    icon: 'postgresql.svg',
    suggestedSlug: 'postgres',
    transport: MCPServerTransport.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', { credentialField: 'postgresUrl' }],
    requiredCredentialSchema: 'PostgresUrl',
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default postgresqlPreset
