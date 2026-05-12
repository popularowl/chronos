import { StatusCodes } from 'http-status-codes'
import { MCPServer } from '../../database/entities/MCPServer'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { MCPServerChangeKind, MCPServerStatus, MCPServerTransport } from '../../Interface'
import mcpServerChangeLogService, { snapshotMCPServer } from '../mcp-server-change-log'

const DEFAULT_MCP_TIMEOUT_MS = 30000

const isMCPServersEnabled = (): boolean => process.env.ENABLE_MCP_SERVERS === 'true'

const assertMCPServersEnabled = (): void => {
    if (!isMCPServersEnabled()) {
        throw new InternalChronosError(
            StatusCodes.SERVICE_UNAVAILABLE,
            'MCP servers are not enabled. Set ENABLE_MCP_SERVERS=true to enable them.'
        )
    }
}

/**
 * Validates a URL is HTTP/HTTPS and rejects loopback / RFC1918 / link-local
 * targets unless `ALLOW_LOOPBACK_AGENTS=true`. Same SSRF posture as the Agent
 * service — an MCP server URL is just another outbound target the platform
 * proxies traffic to on behalf of agents.
 */
const validateOutboundUrl = (raw: string, fieldName: string): void => {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `${fieldName} must be a valid HTTP or HTTPS URL`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `${fieldName} must use http or https`)
    }

    if (process.env.ALLOW_LOOPBACK_AGENTS === 'true') return

    const host = parsed.hostname.toLowerCase()
    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host === '0.0.0.0' ||
        host === '::' ||
        host === '::1' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
        /^fe80:/i.test(host) ||
        /^fc[0-9a-f]{2}:/i.test(host) ||
        /^fd[0-9a-f]{2}:/i.test(host)
    ) {
        throw new InternalChronosError(
            StatusCodes.BAD_REQUEST,
            `${fieldName} cannot point at loopback or private addresses. Set ALLOW_LOOPBACK_AGENTS=true for local development.`
        )
    }
}

const slugifyName = (name: string): string => {
    return (
        (name || 'mcp-server')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'mcp-server'
    )
}

const ensureUniqueSlug = async (slug: string, excludeId?: string): Promise<string> => {
    const appServer = getRunningExpressApp()
    const repo = appServer.AppDataSource.getRepository(MCPServer)
    let candidate = slug
    for (let n = 1; n <= 1000; n++) {
        const existing = await repo.findOneBy({ slug: candidate })
        if (!existing || existing.id === excludeId) return candidate
        candidate = `${slug}-${n}`
    }
    throw new InternalChronosError(StatusCodes.CONFLICT, `Could not find a unique slug after 1000 attempts (base: ${slug})`)
}

const stringifyJsonField = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'string') return value
    return JSON.stringify(value)
}

/**
 * Validates transport-specific required fields. `streamable-http` and `sse`
 * require a URL. `stdio` is reserved in the schema (locked decision #8) and
 * rejected at the service layer until v1.8.
 */
const assertTransportContract = (transport: MCPServerTransport, body: any): void => {
    if (transport === MCPServerTransport.STDIO) {
        throw new InternalChronosError(
            StatusCodes.NOT_IMPLEMENTED,
            'stdio transport is reserved and not implemented in v1.6. Use streamable-http or sse.'
        )
    }
    if (transport === MCPServerTransport.STREAMABLE_HTTP || transport === MCPServerTransport.SSE) {
        if (!body.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `url is required for ${transport} transport`)
        }
        validateOutboundUrl(body.url, 'url')
    }
}

const createMCPServer = async (requestBody: any): Promise<MCPServer> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()

        if (!requestBody.name) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'name is required')
        }
        if (!requestBody.transport) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'transport is required')
        }

        const transport = requestBody.transport as MCPServerTransport
        if (!Object.values(MCPServerTransport).includes(transport)) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `Invalid transport. Allowed: ${Object.values(MCPServerTransport).join(', ')}`
            )
        }

        assertTransportContract(transport, requestBody)

        const requestedSlug = requestBody.slug ? slugifyName(requestBody.slug) : slugifyName(requestBody.name)
        const slug = await ensureUniqueSlug(requestedSlug)

        const newServer = new MCPServer()
        newServer.name = requestBody.name
        newServer.slug = slug
        newServer.description = requestBody.description ?? undefined
        newServer.transport = transport
        newServer.url = requestBody.url ?? undefined
        newServer.command = stringifyJsonField(requestBody.command)
        newServer.outboundAuth = stringifyJsonField(requestBody.outboundAuth)
        newServer.allowedTools = stringifyJsonField(requestBody.allowedTools)
        newServer.requestHeaders = stringifyJsonField(requestBody.requestHeaders)
        newServer.policies = stringifyJsonField(requestBody.policies)
        newServer.timeoutMs = requestBody.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS
        newServer.status = MCPServerStatus.UNKNOWN
        newServer.enabled = requestBody.enabled !== false
        newServer.userId = requestBody.userId || undefined

        const saved = appServer.AppDataSource.getRepository(MCPServer).create(newServer)
        const persisted = await appServer.AppDataSource.getRepository(MCPServer).save(saved)
        // Best-effort change-log write — runs after persist so the diff
        // reflects what's actually on the row. Failures never break the
        // create path (see service contract).
        void mcpServerChangeLogService.recordCreate({
            mcpServerId: persisted.id,
            snapshot: snapshotMCPServer(persisted as unknown as Record<string, unknown>),
            actor: { userId: requestBody.userId ?? null, userEmail: requestBody.userEmail ?? null }
        })
        // A new MCP server can change the catalog for any registered agent
        // whose `allowedTools` references this slug. Broadcast — re-fetching
        // `tools/list` is cheap and the affected-agent set is unbounded.
        appServer.mcpCatalogChangeEmitter?.emitGlobal()
        return persisted
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.createMCPServer - ${getErrorMessage(error)}`
        )
    }
}

const updateMCPServer = async (id: string, body: any): Promise<MCPServer> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(MCPServer)
        const server = await repo.findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }

        // Snapshot before any mutations so the diff captures every change.
        const beforeSnapshot = snapshotMCPServer(server as unknown as Record<string, unknown>)

        if (body.transport && body.transport !== server.transport) {
            const transport = body.transport as MCPServerTransport
            if (!Object.values(MCPServerTransport).includes(transport)) {
                throw new InternalChronosError(
                    StatusCodes.BAD_REQUEST,
                    `Invalid transport. Allowed: ${Object.values(MCPServerTransport).join(', ')}`
                )
            }
            assertTransportContract(transport, { url: body.url ?? server.url })
            server.transport = transport
        }

        if (body.url) {
            validateOutboundUrl(body.url, 'url')
            server.url = body.url
        }

        if (body.slug && body.slug !== server.slug) {
            server.slug = await ensureUniqueSlug(slugifyName(body.slug), server.id)
        }

        const updatable: Array<keyof MCPServer> = ['name', 'description', 'enabled', 'timeoutMs']
        for (const key of updatable) {
            if (body[key] !== undefined) (server as any)[key] = body[key]
        }

        const jsonFields: Array<keyof MCPServer> = ['command', 'outboundAuth', 'allowedTools', 'requestHeaders', 'policies']
        for (const key of jsonFields) {
            if (body[key] !== undefined) (server as any)[key] = stringifyJsonField(body[key])
        }

        const saved = await repo.save(server)
        void mcpServerChangeLogService.recordUpdate({
            mcpServerId: saved.id,
            before: beforeSnapshot,
            after: snapshotMCPServer(saved as unknown as Record<string, unknown>),
            actor: { userId: body.userId ?? null, userEmail: body.userEmail ?? null }
        })
        appServer.mcpCatalogChangeEmitter?.emitGlobal()
        return saved
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.updateMCPServer - ${getErrorMessage(error)}`
        )
    }
}

const deleteMCPServer = async (id: string, actor: { userId?: string; userEmail?: string } = {}): Promise<any> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        const server = await appServer.AppDataSource.getRepository(MCPServer).findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }
        const snapshot = snapshotMCPServer(server as unknown as Record<string, unknown>)
        const result = await appServer.AppDataSource.getRepository(MCPServer).delete({ id })
        void mcpServerChangeLogService.recordDelete({
            mcpServerId: id,
            snapshot,
            actor: { userId: actor.userId ?? null, userEmail: actor.userEmail ?? null }
        })
        appServer.mcpCatalogChangeEmitter?.emitGlobal()
        return result
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.deleteMCPServer - ${getErrorMessage(error)}`
        )
    }
}

const getAllMCPServers = async (page: number = -1, limit: number = -1, filters: { transport?: string; status?: string } = {}) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(MCPServer)
            .createQueryBuilder('mcp_server')
            .orderBy('mcp_server.updatedDate', 'DESC')

        if (filters.transport) queryBuilder.andWhere('mcp_server.transport = :transport', { transport: filters.transport })
        if (filters.status) queryBuilder.andWhere('mcp_server.status = :status', { status: filters.status })

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        if (page > 0 && limit > 0) {
            return { data, total }
        }
        return data
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.getAllMCPServers - ${getErrorMessage(error)}`
        )
    }
}

const getMCPServerById = async (id: string): Promise<MCPServer> => {
    try {
        const appServer = getRunningExpressApp()
        const server = await appServer.AppDataSource.getRepository(MCPServer).findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }
        return server
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.getMCPServerById - ${getErrorMessage(error)}`
        )
    }
}

const getMCPServerBySlug = async (slug: string): Promise<MCPServer | null> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(MCPServer).findOneBy({ slug })
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.getMCPServerBySlug - ${getErrorMessage(error)}`
        )
    }
}

const toggleMCPServer = async (id: string, enabled: boolean, actor: { userId?: string; userEmail?: string } = {}): Promise<MCPServer> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(MCPServer)
        const server = await repo.findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }
        const beforeSnapshot = snapshotMCPServer(server as unknown as Record<string, unknown>)
        const wasEnabled = server.enabled
        server.enabled = enabled
        if (!enabled) server.status = MCPServerStatus.DISABLED
        else if (server.status === MCPServerStatus.DISABLED) server.status = MCPServerStatus.UNKNOWN
        const saved = await repo.save(server)
        if (wasEnabled !== enabled) {
            void mcpServerChangeLogService.recordUpdate({
                mcpServerId: saved.id,
                before: beforeSnapshot,
                after: snapshotMCPServer(saved as unknown as Record<string, unknown>),
                actor: { userId: actor.userId ?? null, userEmail: actor.userEmail ?? null },
                kindOverride: enabled ? MCPServerChangeKind.ENABLED : MCPServerChangeKind.DISABLED
            })
        }
        appServer.mcpCatalogChangeEmitter?.emitGlobal()
        return saved
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.toggleMCPServer - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Operator-facing connection test for a registered MCP server. Issues a real
 * MCP `tools/list` round-trip via the gateway's pooled client — same path the
 * health poller uses — so a successful test proves what callbacks will
 * actually see, not just TCP reachability. Returns a UI-shaped result with a
 * descriptive message that includes the discovered tool count on success.
 */
const testMCPServerConnection = async (id: string): Promise<any> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        const server = await appServer.AppDataSource.getRepository(MCPServer).findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }
        if (server.transport === MCPServerTransport.STDIO) {
            throw new InternalChronosError(StatusCodes.NOT_IMPLEMENTED, 'stdio transport is not supported in v1.6')
        }
        if (!server.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server has no url configured')
        }
        if (!appServer.mcpGateway) {
            throw new InternalChronosError(
                StatusCodes.SERVICE_UNAVAILABLE,
                'MCP gateway is not enabled. Set ENABLE_MCP_SERVERS=true to enable it.'
            )
        }
        const startedAt = Date.now()
        try {
            const tools = await appServer.mcpGateway.listLiveTools(server)
            const count = Array.isArray(tools) ? tools.length : 0
            return {
                success: true,
                statusCode: 200,
                latencyMs: Date.now() - startedAt,
                toolCount: count,
                message: `Connected — ${count} tool${count === 1 ? '' : 's'} discovered`
            }
        } catch (probeError) {
            return {
                success: false,
                statusCode: probeError instanceof InternalChronosError ? probeError.statusCode : null,
                latencyMs: Date.now() - startedAt,
                message: getErrorMessage(probeError)
            }
        }
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.testMCPServerConnection - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Calls `tools/list` on the registered MCP server through the gateway's pooled
 * client. Returns the live catalog (operator tooling for the registry UI).
 * Requires `ENABLE_MCP_SERVERS=true` (gateway is wired in `App.initDatabase`).
 */
const listMCPServerTools = async (id: string): Promise<any[]> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        const server = await appServer.AppDataSource.getRepository(MCPServer).findOneBy({ id })
        if (!server) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `MCP server ${id} not found`)
        }
        if (!server.enabled) {
            throw new InternalChronosError(StatusCodes.CONFLICT, `MCP server ${server.slug} is disabled`)
        }
        if (server.transport === MCPServerTransport.STDIO) {
            throw new InternalChronosError(StatusCodes.NOT_IMPLEMENTED, 'stdio transport is not supported in v1.6')
        }
        if (!server.url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server has no url configured')
        }
        if (!appServer.mcpGateway) {
            throw new InternalChronosError(
                StatusCodes.SERVICE_UNAVAILABLE,
                'MCP gateway is not enabled. Set ENABLE_MCP_SERVERS=true to enable it.'
            )
        }
        return await appServer.mcpGateway.listLiveTools(server)
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.listMCPServerTools - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Calls `tools/list` against an unsaved MCP server using the registration
 * body. Same SSRF + transport-contract validation as `createMCPServer`, then
 * delegates to the gateway's transient (non-pooled) preview path. Used by
 * the registration UI's Discover Tools button before commit.
 */
const previewMCPServerTools = async (body: any): Promise<any[]> => {
    try {
        assertMCPServersEnabled()
        const appServer = getRunningExpressApp()
        if (!body || !body.transport) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'transport is required')
        }
        const transport = body.transport as MCPServerTransport
        if (!Object.values(MCPServerTransport).includes(transport)) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `Invalid transport. Allowed: ${Object.values(MCPServerTransport).join(', ')}`
            )
        }
        assertTransportContract(transport, body)
        if (!appServer.mcpGateway) {
            throw new InternalChronosError(
                StatusCodes.SERVICE_UNAVAILABLE,
                'MCP gateway is not enabled. Set ENABLE_MCP_SERVERS=true to enable it.'
            )
        }
        return await appServer.mcpGateway.previewLiveTools({
            transport,
            url: body.url,
            outboundAuth: body.outboundAuth,
            requestHeaders: body.requestHeaders,
            timeoutMs: body.timeoutMs,
            slug: body.slug
        })
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServersService.previewMCPServerTools - ${getErrorMessage(error)}`
        )
    }
}

export default {
    isMCPServersEnabled,
    createMCPServer,
    updateMCPServer,
    deleteMCPServer,
    getAllMCPServers,
    getMCPServerById,
    getMCPServerBySlug,
    toggleMCPServer,
    testMCPServerConnection,
    listMCPServerTools,
    previewMCPServerTools
}
