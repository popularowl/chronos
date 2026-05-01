import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { DataSource } from 'typeorm'
import { StatusCodes } from 'http-status-codes'
import { Agent } from '../../database/entities/Agent'
import { MCPServer } from '../../database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import logger from '../../utils/logger'
import httpAgentRuntime from '../agent-runtime-http'

const DEFAULT_IDLE_TIMEOUT_MS = 300000
const REAPER_INTERVAL_MS = 60000
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 30000

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
        logger.info(`🛰️ [MCPGateway] Starting (idleTimeoutMs=${this.idleTimeoutMs}, reaperIntervalMs=${REAPER_INTERVAL_MS})`)
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
                logger.warn(`[MCPGateway] Failed to close client for server ${id}: ${getErrorMessage(error)}`)
            }
        }
        logger.info('🛰️ [MCPGateway] Stopped')
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
            logger.info({
                event: 'mcp.tool.invoke',
                agentId: agent.id,
                agentSlug: agent.slug,
                server: serverSlug,
                tool: toolName,
                durationMs: Date.now() - startedAt,
                callId: callContext.callId
            })
            return result
        } catch (error) {
            // Drop the pooled client on error — the connection may be poisoned.
            this.pool.delete(server.id)
            entry.client.close().catch(() => {
                /* noop */
            })
            logger.warn({
                event: 'mcp.tool.invoke.error',
                agentId: agent.id,
                agentSlug: agent.slug,
                server: serverSlug,
                tool: toolName,
                durationMs: Date.now() - startedAt,
                callId: callContext.callId,
                error: getErrorMessage(error)
            })
            throw new InternalChronosError(StatusCodes.BAD_GATEWAY, `MCP tool ${namespacedToolName} failed: ${getErrorMessage(error)}`)
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
                    logger.warn(`[MCPGateway] Failed to close idle client for server ${id}: ${getErrorMessage(error)}`)
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
