import { MCPServerTransport } from '../../../Interface'
import { MCPPreset } from './types'

/**
 * GitHub MCP preset — wraps `@modelcontextprotocol/server-github` over
 * stdio. The Chronos user supplies a `githubApi` credential whose
 * `accessToken` field is bound to `GITHUB_PERSONAL_ACCESS_TOKEN` at spawn
 * time. The preset does not pre-restrict `allowedTools`; the Chronos user
 * picks the tool subset on the dialog before saving or via Discover Tools
 * after the row is created.
 */
const githubPreset: MCPPreset = {
    id: 'github',
    displayName: 'GitHub',
    description: 'Issues, pull requests, repository operations via the official GitHub MCP server.',
    icon: 'github.svg',
    suggestedSlug: 'github',
    transport: MCPServerTransport.STDIO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: { credentialField: 'accessToken' }
    },
    requiredCredentialSchema: 'githubApi',
    defaultAllowedTools: [],
    defaultTimeoutMs: 30000
}

export default githubPreset
