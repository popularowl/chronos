import { INodeParams, INodeCredential } from '../src/Interface'

/**
 * OAuth2 refresh-token credential used by the MCP gateway as outbound auth
 * for registered MCP servers (added in v1.8.0).
 *
 * The Chronos user completes consent on the provider's side themselves
 * (paste-only initial flow — Chronos does not host the brokered consent
 * dance in v1.8.0) and pastes the refresh + access tokens here. The
 * `OAuth2RefreshScheduler` and the on-demand resolver under
 * `services/credentials/oauth2-refresh.ts` rotate the access token via
 * RFC 6749 § 6 against `tokenEndpoint` as expiry approaches.
 *
 * The `name` field is the literal `oauth2-refresh` string the rest of the
 * platform matches on. Do not rename without sweeping
 * `services/credentials/oauth2-refresh.ts`,
 * `schedulers/OAuth2RefreshScheduler.ts`, `Interface.ts`, and
 * `services/agent-runtime-http/index.ts`.
 */
class MCPOAuth2Refresh implements INodeCredential {
    label: string
    name: string
    version: number
    inputs: INodeParams[]
    description: string

    constructor() {
        this.label = 'MCP OAuth2 Refresh'
        // Literal — matches the credentialName the platform filters on. The
        // substring lookup in AddEditCredentialDialog for 'OAuth2' (case-
        // sensitive) intentionally does NOT match this name; the legacy
        // brokered-consent affordances are out of scope here.
        this.name = 'oauth2-refresh'
        this.version = 1.0
        this.description =
            'Used as outbound auth on a registered MCP server. Complete OAuth consent on the provider side first, then paste the resulting tokens here. The gateway will rotate the access token transparently as expiry approaches.'
        this.inputs = [
            {
                label: 'Token Endpoint',
                name: 'tokenEndpoint',
                type: 'string',
                description: 'The provider RFC 6749 token endpoint (e.g. https://slack.com/api/oauth.v2.access).'
            },
            {
                label: 'Client ID',
                name: 'clientId',
                type: 'string',
                description: 'OAuth application client ID issued by the provider.'
            },
            {
                label: 'Client Secret',
                name: 'clientSecret',
                type: 'password',
                description: 'OAuth application client secret issued by the provider.'
            },
            {
                label: 'Refresh Token',
                name: 'refreshToken',
                type: 'password',
                description: 'Long-lived refresh token from the consent flow. Never leaves Chronos.'
            },
            {
                label: 'Access Token',
                name: 'accessToken',
                type: 'password',
                description: 'Current access token. Rotated automatically by the gateway as expiry approaches.'
            },
            {
                label: 'Expires At',
                name: 'expiresAt',
                type: 'string',
                description:
                    'ISO 8601 timestamp at which the current access token expires. Example: 2026-05-12T18:00:00.000Z. Compute as Date.now() + expires_in * 1000 from the provider response.'
            },
            {
                label: 'Token Type',
                name: 'tokenType',
                type: 'string',
                default: 'Bearer',
                description: 'RFC 6749 § 5.1 token_type. Almost always "Bearer".'
            },
            {
                label: 'Scope',
                name: 'scope',
                type: 'string',
                optional: true,
                description: 'Informational. Space-delimited scopes granted by the provider during consent.'
            }
        ]
    }
}

module.exports = { credClass: MCPOAuth2Refresh }
