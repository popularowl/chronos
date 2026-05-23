import { MCPServerTransport } from '../../../Interface'

/**
 * Reference to a credential field within an `args` array. The frontend
 * substitutes this with `{{<chosenCredentialId>:<field>}}` once the
 * Chronos user picks a credential during preset instantiation; at spawn
 * time the gateway's stdio resolver decrypts the named field and
 * interpolates the literal into the argv string. Presets carry these
 * markers so the args array is structured data rather than a free-form
 * template string the UI must parse.
 */
export interface PresetArgCredentialRef {
    credentialField: string
}

/** Argv element in a preset — either a literal string or a credential ref. */
export type PresetArgItem = string | PresetArgCredentialRef

/**
 * Reference to a credential field within an `env` value. The frontend
 * substitutes this with `{ credentialId, field }` once a credential is
 * picked; at spawn time the gateway resolves the credential vault and
 * supplies the decrypted value as the env-var content. Presets carry
 * these markers so the env map is structured data rather than a JSON
 * blob the UI must rewrite.
 */
export interface PresetEnvCredentialRef {
    credentialField: string
}

/** Single env value in a preset — inline literal or credential ref. */
export type PresetEnvValue = string | PresetEnvCredentialRef

/**
 * A single MCP-server preset bundled with the platform. Presets describe
 * everything `MCPServerDialog` needs to prefill a "Register MCP Server"
 * form — slug suggestion, transport, command/args/env, the credential
 * schema the user must pick, and a default `allowedTools` list. Presets
 * never persist directly; they're a UI convenience for one-click
 * registration of common MCP servers.
 *
 * The `iconSvg` field carries the inlined SVG content so the UI renders
 * the icon without an extra round-trip; presets are static config and
 * fit comfortably in the catalogue payload.
 */
export interface MCPPreset {
    /** Stable preset id used in the URL (`/mcp-servers/presets/<id>`). */
    id: string
    /** Human-readable display name shown on the preset card. */
    displayName: string
    /** Short description shown on the preset card and dialog header. */
    description: string
    /** Filename of the icon SVG under `icons/`. */
    icon: string
    /**
     * Inlined SVG content for the icon, populated by the loader at
     * module-init time. Carried in the API response so the UI can render
     * the icon inline without a separate fetch.
     */
    iconSvg?: string
    /** Suggested slug to prefill — Chronos user can still edit. */
    suggestedSlug: string
    /** Transport — currently every preset is `stdio`. */
    transport: MCPServerTransport
    /** Spawn command (only for `stdio`). */
    command?: string
    /** Argv with optional credential refs (only for `stdio`). */
    args?: PresetArgItem[]
    /** Env map with optional credential refs (only for `stdio`). */
    env?: Record<string, PresetEnvValue>
    /**
     * Optional `credentialName` of the Chronos credential schema the user
     * must pick during preset instantiation. Undefined for presets that
     * require no credential (e.g. Memory, Time). When set, the UI
     * filters its credential picker to credentials of this schema and
     * surfaces an inline "Create credential" link if none exist yet.
     */
    requiredCredentialSchema?: string
    /**
     * Default `allowedTools` to seed on the new `MCPServer` row. Empty
     * array means "no restriction at the server layer" (agents are still
     * gated by their own `allowedTools`).
     */
    defaultAllowedTools: string[]
    /** Default request timeout in ms applied to the new `MCPServer` row. */
    defaultTimeoutMs: number
    /**
     * Populated by the loader from a PATH probe over the preset's
     * `command` at catalogue-build time. `true` for HTTP/SSE presets and
     * for stdio presets whose `command` resolves on the server's PATH;
     * `false` otherwise. The UI greys out unavailable cards with
     * `unavailableReason` as the hint instead of letting the Chronos
     * user click through to a guaranteed `ENOENT` at spawn time.
     */
    available?: boolean
    /** Why the preset is unavailable on this host — e.g. `Requires uvx on host PATH`. */
    unavailableReason?: string
}
