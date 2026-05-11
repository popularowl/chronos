import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { DataSource } from 'typeorm'
import { StatusCodes } from 'http-status-codes'
import { Agent } from '../../database/entities/Agent'
import { MCPServer } from '../../database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { createModuleLogger } from '../../utils/logger'

const logger = createModuleLogger('MCPGateway')
import auditService from '../audit'
import httpAgentRuntime from '../agent-runtime-http'

const DEFAULT_IDLE_TIMEOUT_MS = 300000
const REAPER_INTERVAL_MS = 60000
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 30000
const DEFAULT_HEALTH_TIMEOUT_MS = 5000

interface PoolEntry {
    client: Client
    serverSlug: string
    lastUsedAt: number
}

interface MCPGatewayOptions {
    appDataSource: DataSource
}

export interface AllowedToolDescriptor {
    name: string
    server: string
    tool: string
}

export interface LiveToolDescriptor {
    name: string
    description?: string
    inputSchema?: unknown
}

/**
 * Enriched member of the agent's allowed-tool catalog. The MCP server's
 * `tools/list` handler returns this shape — `name` is namespaced as
 * `<server-slug>.<tool>` (the same shape `MCPGateway.invoke()` accepts).
 */
export interface EnrichedAllowedTool {
    name: string
    description?: string
    inputSchema?: unknown
}

/**
 * Internal MCP client manager. Brokers `tools/call` requests from registered
 * HTTP agents to registered MCP servers, enforcing the intersection of
 * `Agent.allowedTools` and `MCPServer.allowedTools`. Connections are pooled
 * per-server with idle eviction; the reaper runs every 60s and closes any
 * client unused for `MCP_CLIENT_IDLE_TIMEOUT_MS` (default 5 min).
 *
 * Lifecycle: `start()` arms the reaper; `stop()` clears the reaper and closes
 * every pooled client. Gated externally on `ENABLE_MCP_SERVERS=true`.
 */
export class MCPGateway {
    private appDataSource: DataSource
    private pool: Map<string, PoolEntry> = new Map()
    private reaperId: ReturnType<typeof setInterval> | null = null
    private idleTimeoutMs: number

    constructor(options: MCPGatewayOptions) {
        this.appDataSource = options.appDataSource
        this.idleTimeoutMs = process.env.MCP_CLIENT_IDLE_TIMEOUT_MS
            ? parseInt(process.env.MCP_CLIENT_IDLE_TIMEOUT_MS, 10)
            : DEFAULT_IDLE_TIMEOUT_MS
    }

    public start(): void {
        if (this.reaperId) return
        logger.info(`Starting (idleTimeoutMs=${this.idleTimeoutMs}, reaperIntervalMs=${REAPER_INTERVAL_MS})`)
        this.reaperId = setInterval(() => this.reapIdle(), REAPER_INTERVAL_MS)
    }

    public async stop(): Promise<void> {
        if (this.reaperId) {
            clearInterval(this.reaperId)
            this.reaperId = null
        }
        const entries = Array.from(this.pool.entries())
        this.pool.clear()
        for (const [id, entry] of entries) {
            try {
                await entry.client.close()
            } catch (error) {
                logger.warn(`Failed to close client for server ${id}: ${getErrorMessage(error)}`)
            }
        }
        logger.info('Stopped')
    }

    /**
     * Invoke a namespaced MCP tool on behalf of an HTTP agent. Resolves the
     * `<slug>.<tool>` namespace, enforces both intersection layers, then
     * forwards a `tools/call` over the pooled MCP client. Throws
     * `InternalChronosError` with a status code that maps directly onto the
     * HTTP response the controller will return.
     */
    public async invoke(
        agent: Agent,
        namespacedToolName: string,
        params: unknown,
        callContext: { callId?: string } = {}
    ): Promise<unknown> {
        const { serverSlug, toolName } = this.parseNamespacedTool(namespacedToolName)

        const repo = this.appDataSource.getRepository(MCPServer)
        const server = await repo.findOneBy({ slug: serverSlug })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server "${serverSlug}" not found`)
        }
        if (!server.enabled) {
            throw new InternalChronosError(StatusCodes.CONFLICT, `MCP server "${serverSlug}" is disabled`)
        }
        if (server.status === MCPServerStatus.UNHEALTHY) {
            throw new InternalChronosError(StatusCodes.SERVICE_UNAVAILABLE, `MCP server "${serverSlug}" is unhealthy`)
        }

        const agentAllowed = parseAllowedTools(agent.allowedTools)
        if (!agentAllowed.includes(namespacedToolName)) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, `Agent ${agent.slug} is not permitted to call tool ${namespacedToolName}`)
        }
        const serverAllowed = parseAllowedTools(server.allowedTools)
        if (serverAllowed.length > 0 && !serverAllowed.includes(toolName)) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, `MCP server ${serverSlug} does not expose tool ${toolName}`)
        }

        const startedAt = Date.now()
        const entry = await this.getOrOpen(server)
        const timeout = typeof server.timeoutMs === 'number' ? server.timeoutMs : DEFAULT_TOOL_CALL_TIMEOUT_MS

        try {
            const result = await entry.client.request(
                { method: 'tools/call', params: { name: toolName, arguments: (params ?? {}) as Record<string, unknown> } },
                CallToolResultSchema,
                { timeout }
            )
            entry.lastUsedAt = Date.now()
            const durationMs = Date.now() - startedAt
            logger.info({
                event: 'mcp.tool.invoke',
                agentId: agent.id,
                agentSlug: agent.slug,
                server: serverSlug,
                tool: toolName,
                durationMs,
                callId: callContext.callId
            })
            // Persist the audit row best-effort. Fire-and-forget — the gateway
            // hot path must not block on the DB write, and the auditService
            // catches its own errors so this can never throw.
            void auditService.recordToolInvocation({
                agentId: agent.id,
                agentSlug: agent.slug,
                mcpServerId: server.id,
                mcpServerSlug: serverSlug,
                toolName,
                namespacedTool: namespacedToolName,
                success: true,
                durationMs,
                errorMessage: null,
                callId: callContext.callId ?? null,
                userId: agent.userId ?? null
            })
            return result
        } catch (error) {
            // Drop the pooled client on error — the connection may be poisoned.
            this.pool.delete(server.id)
            entry.client.close().catch(() => {
                /* noop */
            })
            const durationMs = Date.now() - startedAt
            const errorMessage = getErrorMessage(error)
            logger.warn({
                event: 'mcp.tool.invoke.error',
                agentId: agent.id,
                agentSlug: agent.slug,
                server: serverSlug,
                tool: toolName,
                durationMs,
                callId: callContext.callId,
                error: errorMessage
            })
            void auditService.recordToolInvocation({
                agentId: agent.id,
                agentSlug: agent.slug,
                mcpServerId: server.id,
                mcpServerSlug: serverSlug,
                toolName,
                namespacedTool: namespacedToolName,
                success: false,
                durationMs,
                errorMessage,
                callId: callContext.callId ?? null,
                userId: agent.userId ?? null
            })
            throw new InternalChronosError(StatusCodes.BAD_GATEWAY, `MCP tool ${namespacedToolName} failed: ${errorMessage}`)
        }
    }

    /**
     * Static intersection of `Agent.allowedTools` with each registered server's
     * `allowedTools`. Does not open MCP clients — operator-tooling for the live
     * `tools/list` round-trip lives on `GET /api/v1/mcp-servers/:id/tools`.
     */
    public async listAllowedTools(agent: Agent): Promise<AllowedToolDescriptor[]> {
        const agentAllowed = parseAllowedTools(agent.allowedTools)
        if (agentAllowed.length === 0) return []

        const bySlug = new Map<string, string[]>()
        for (const namespaced of agentAllowed) {
            const parsed = tryParseNamespacedTool(namespaced)
            if (!parsed) continue
            if (!bySlug.has(parsed.serverSlug)) bySlug.set(parsed.serverSlug, [])
            bySlug.get(parsed.serverSlug)!.push(parsed.toolName)
        }

        const repo = this.appDataSource.getRepository(MCPServer)
        const result: AllowedToolDescriptor[] = []
        for (const [slug, tools] of bySlug.entries()) {
            const server = await repo.findOneBy({ slug })
            if (!server || !server.enabled) continue
            const serverAllowed = parseAllowedTools(server.allowedTools)
            for (const tool of tools) {
                if (serverAllowed.length > 0 && !serverAllowed.includes(tool)) continue
                result.push({ name: `${slug}.${tool}`, server: slug, tool })
            }
        }
        return result
    }

    /**
     * Like `listAllowedTools` but enriched with `description` + `inputSchema`
     * by calling each registered server's live `tools/list` (via the existing
     * pool) and stitching results. Used by the agent-facing MCP server's
     * `tools/list` handler — agents need rich schemas to compose LLM tool
     * arrays.
     *
     * Fail-soft per server: an unhealthy / disabled / unreachable server
     * contributes empty rather than failing the whole list. The intersection
     * still applies — even a server whose live tools/list errors will produce
     * no tools, which matches the "if the server can't be reached, the agent
     * cannot call its tools" semantics already enforced at invoke time.
     */
    public async listAllowedToolsEnriched(agent: Agent): Promise<EnrichedAllowedTool[]> {
        const agentAllowed = parseAllowedTools(agent.allowedTools)
        if (agentAllowed.length === 0) return []

        const bySlug = new Map<string, Set<string>>()
        for (const namespaced of agentAllowed) {
            const parsed = tryParseNamespacedTool(namespaced)
            if (!parsed) continue
            const set = bySlug.get(parsed.serverSlug) ?? new Set<string>()
            set.add(parsed.toolName)
            bySlug.set(parsed.serverSlug, set)
        }
        if (bySlug.size === 0) return []

        const repo = this.appDataSource.getRepository(MCPServer)
        const servers = await repo.find({ where: Array.from(bySlug.keys()).map((slug) => ({ slug })) })

        const enrichedPerServer = await Promise.all(
            servers.map(async (server) => {
                if (!server.enabled || server.status === MCPServerStatus.UNHEALTHY) return [] as EnrichedAllowedTool[]
                const wantedTools = bySlug.get(server.slug)
                if (!wantedTools || wantedTools.size === 0) return [] as EnrichedAllowedTool[]
                let live: LiveToolDescriptor[] = []
                try {
                    live = await this.listLiveTools(server)
                } catch {
                    // Fail-soft per server — see method JSDoc.
                    return [] as EnrichedAllowedTool[]
                }
                const serverAllowed = parseAllowedTools(server.allowedTools)
                const result: EnrichedAllowedTool[] = []
                for (const tool of live) {
                    if (typeof tool.name !== 'string') continue
                    if (!wantedTools.has(tool.name)) continue
                    if (serverAllowed.length > 0 && !serverAllowed.includes(tool.name)) continue
                    result.push({
                        name: `${server.slug}.${tool.name}`,
                        description: typeof tool.description === 'string' ? tool.description : undefined,
                        inputSchema: tool.inputSchema
                    })
                }
                return result
            })
        )
        return enrichedPerServer.flat()
    }

    /**
     * Calls `tools/list` on the live MCP server using a pooled client and
     * returns the discovered catalog. Operator-tooling for the registry UI;
     * not on the agent → callback hot path. Errors map to 502 BAD_GATEWAY
     * and evict the pooled client so the next call reconnects fresh.
     */
    public async listLiveTools(server: MCPServer): Promise<LiveToolDescriptor[]> {
        const startedAt = Date.now()
        const entry = await this.getOrOpen(server)
        const timeout = typeof server.timeoutMs === 'number' ? server.timeoutMs : DEFAULT_TOOL_CALL_TIMEOUT_MS
        try {
            const result = await entry.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema, { timeout })
            entry.lastUsedAt = Date.now()
            const tools = Array.isArray((result as any).tools) ? (result as any).tools : []
            logger.info({
                event: 'mcp.tools.list',
                server: server.slug,
                count: tools.length,
                durationMs: Date.now() - startedAt
            })
            return tools.map((t: any) => ({
                name: t?.name,
                description: t?.description,
                inputSchema: t?.inputSchema
            }))
        } catch (error) {
            this.pool.delete(server.id)
            entry.client.close().catch(() => {
                /* noop */
            })
            logger.warn({
                event: 'mcp.tools.list.error',
                server: server.slug,
                durationMs: Date.now() - startedAt,
                error: getErrorMessage(error)
            })
            throw new InternalChronosError(
                StatusCodes.BAD_GATEWAY,
                `Failed to list tools for MCP server ${server.slug}: ${getErrorMessage(error)}`
            )
        }
    }

    /**
     * Health probe used by `MCPServerHealthPoller`. Calls `tools/list` via the
     * pooled client so liveness reflects what real callbacks will see; resolves
     * on success, throws on failure. Connection-pool eviction on error is
     * inherited (the next probe reconnects fresh).
     *
     * Timeout: `Math.min(server.timeoutMs, MCP_SERVER_HEALTH_TIMEOUT_MS)` —
     * env-driven cap (default 5000ms) keeps health checks bounded even if the
     * per-server tool-call budget is much larger. Total wall time includes the
     * MCP handshake on first call (TCP/TLS + `initialize`); the Promise.race
     * bound covers the entire probe.
     */
    public async healthCheck(server: MCPServer): Promise<void> {
        const startedAt = Date.now()
        const envTimeoutMs = process.env.MCP_SERVER_HEALTH_TIMEOUT_MS
            ? parseInt(process.env.MCP_SERVER_HEALTH_TIMEOUT_MS, 10)
            : DEFAULT_HEALTH_TIMEOUT_MS
        const timeoutMs = typeof server.timeoutMs === 'number' ? Math.min(server.timeoutMs, envTimeoutMs) : envTimeoutMs

        let timer: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Health check timed out after ${timeoutMs}ms`)), timeoutMs)
        })
        timeoutPromise.catch(() => {
            /* swallow if probe wins */
        })

        const probePromise = (async () => {
            const entry = await this.getOrOpen(server)
            try {
                await entry.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema, { timeout: timeoutMs })
                entry.lastUsedAt = Date.now()
            } catch (error) {
                this.pool.delete(server.id)
                entry.client.close().catch(() => {
                    /* noop */
                })
                throw error
            }
        })()
        probePromise.catch(() => {
            /* swallow if timeout wins */
        })

        try {
            await Promise.race([probePromise, timeoutPromise])
            logger.info({ event: 'mcp.health.ok', server: server.slug, durationMs: Date.now() - startedAt })
        } catch (error) {
            logger.warn({
                event: 'mcp.health.error',
                server: server.slug,
                durationMs: Date.now() - startedAt,
                error: getErrorMessage(error)
            })
            throw error
        } finally {
            if (timer) clearTimeout(timer)
        }
    }

    /**
     * Calls `tools/list` against an unsaved MCP server using a transient
     * (non-pooled, immediately closed) client. Used by the registration UI's
     * Discover Tools button before the operator commits a new server. SSRF
     * checks happen at the service-layer caller; this method assumes the
     * URL has already been validated.
     */
    public async previewLiveTools(input: {
        transport: MCPServerTransport
        url: string
        outboundAuth?: string | object
        requestHeaders?: string | object
        timeoutMs?: number
        slug?: string
    }): Promise<LiveToolDescriptor[]> {
        if (input.transport === MCPServerTransport.STDIO) {
            throw new InternalChronosError(StatusCodes.NOT_IMPLEMENTED, 'stdio transport is not supported in v1.6')
        }
        if (!input.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'url is required to preview tools')
        }

        const requestHeaders = parseHeaderMap(stringifyMaybe(input.requestHeaders))
        const authHeaders = await httpAgentRuntime.resolveOutboundAuth(stringifyMaybe(input.outboundAuth))
        const headers: Record<string, string> = { ...requestHeaders, ...authHeaders }

        let baseUrl: URL
        try {
            baseUrl = new URL(input.url)
        } catch {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid url: ${input.url}`)
        }

        const client = new Client({ name: 'chronos-gateway-preview', version: '1.0.0' }, { capabilities: {} })
        try {
            if (input.transport === MCPServerTransport.SSE) {
                const transport = new SSEClientTransport(baseUrl, {
                    requestInit: { headers },
                    eventSourceInit: { fetch: (url: any, init: any) => fetch(url, { ...init, headers }) as any }
                } as any)
                await client.connect(transport)
            } else {
                const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit: { headers } })
                await client.connect(transport)
            }
        } catch (error) {
            throw new InternalChronosError(
                StatusCodes.BAD_GATEWAY,
                `Failed to connect to MCP server at ${input.url}: ${getErrorMessage(error)}`
            )
        }

        const startedAt = Date.now()
        const timeout = typeof input.timeoutMs === 'number' ? input.timeoutMs : DEFAULT_TOOL_CALL_TIMEOUT_MS
        try {
            const result = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema, { timeout })
            const tools = Array.isArray((result as any).tools) ? (result as any).tools : []
            logger.info({
                event: 'mcp.tools.list.preview',
                slug: input.slug ?? '(unsaved)',
                count: tools.length,
                durationMs: Date.now() - startedAt
            })
            return tools.map((t: any) => ({
                name: t?.name,
                description: t?.description,
                inputSchema: t?.inputSchema
            }))
        } catch (error) {
            logger.warn({
                event: 'mcp.tools.list.preview.error',
                slug: input.slug ?? '(unsaved)',
                durationMs: Date.now() - startedAt,
                error: getErrorMessage(error)
            })
            throw new InternalChronosError(StatusCodes.BAD_GATEWAY, `Failed to list tools at ${input.url}: ${getErrorMessage(error)}`)
        } finally {
            await client.close().catch(() => {
                /* noop */
            })
        }
    }

    /** Test seam — number of currently pooled MCP clients. */
    public poolSize(): number {
        return this.pool.size
    }

    private reapIdle(): void {
        const cutoff = Date.now() - this.idleTimeoutMs
        for (const [id, entry] of this.pool.entries()) {
            if (entry.lastUsedAt < cutoff) {
                this.pool.delete(id)
                entry.client.close().catch((error) => {
                    logger.warn(`Failed to close idle client for server ${id}: ${getErrorMessage(error)}`)
                })
            }
        }
    }

    private parseNamespacedTool(name: string): { serverSlug: string; toolName: string } {
        const parsed = tryParseNamespacedTool(name)
        if (!parsed) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Tool name must be namespaced as <server-slug>.<tool> — got "${name}"`)
        }
        return parsed
    }

    private async getOrOpen(server: MCPServer): Promise<PoolEntry> {
        const existing = this.pool.get(server.id)
        if (existing) {
            existing.lastUsedAt = Date.now()
            return existing
        }
        if (!server.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `MCP server ${server.slug} has no url configured`)
        }
        if (server.transport === MCPServerTransport.STDIO) {
            throw new InternalChronosError(StatusCodes.NOT_IMPLEMENTED, `stdio transport is not supported in v1.6`)
        }

        const requestHeaders = parseHeaderMap(server.requestHeaders)
        const authHeaders = await httpAgentRuntime.resolveOutboundAuth(server.outboundAuth)
        const headers: Record<string, string> = { ...requestHeaders, ...authHeaders }
        const baseUrl = new URL(server.url)

        const client = new Client({ name: 'chronos-gateway', version: '1.0.0' }, { capabilities: {} })
        try {
            if (server.transport === MCPServerTransport.SSE) {
                const transport = new SSEClientTransport(baseUrl, {
                    requestInit: { headers },
                    eventSourceInit: { fetch: (url: any, init: any) => fetch(url, { ...init, headers }) as any }
                } as any)
                await client.connect(transport)
            } else {
                const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit: { headers } })
                await client.connect(transport)
            }
        } catch (error) {
            throw new InternalChronosError(
                StatusCodes.BAD_GATEWAY,
                `Failed to connect to MCP server ${server.slug}: ${getErrorMessage(error)}`
            )
        }

        const entry: PoolEntry = { client, serverSlug: server.slug, lastUsedAt: Date.now() }
        this.pool.set(server.id, entry)
        return entry
    }
}

/** Parses `<slug>.<tool>` requiring a non-empty slug AND non-empty tool. */
const tryParseNamespacedTool = (name: string): { serverSlug: string; toolName: string } | null => {
    if (typeof name !== 'string') return null
    const idx = name.indexOf('.')
    if (idx <= 0 || idx === name.length - 1) return null
    return { serverSlug: name.slice(0, idx), toolName: name.slice(idx + 1) }
}

const parseAllowedTools = (raw?: string): string[] => {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
    } catch {
        return []
    }
}

/**
 * Normalises a JSON-stringified-or-object value into a JSON string. Lets the
 * preview path accept the registration body's plain-object shape AND the
 * persisted entity's stringified shape, both reusing the existing parsers.
 */
const stringifyMaybe = (value: string | object | undefined | null): string | undefined => {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string') return value
    try {
        return JSON.stringify(value)
    } catch {
        return undefined
    }
}

const parseHeaderMap = (raw?: string): Record<string, string> => {
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof k === 'string' && typeof v === 'string') result[k] = v
        }
        return result
    } catch {
        return {}
    }
}
