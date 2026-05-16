import { DataSource } from 'typeorm'
import { MCPServer } from '../database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../Interface'
import { getErrorMessage } from '../errors/utils'
import { MCPGateway } from '../services/mcp-gateway'
import { CatalogChangeEmitter } from '../services/mcp-gateway-server'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('MCPServerHealthPoller')

const DEFAULT_POLL_INTERVAL_MS = 30000
const CONCURRENCY_CAP = 10

interface MCPServerHealthPollerOptions {
    appDataSource: DataSource
    mcpGateway: MCPGateway
    catalogChangeEmitter?: CatalogChangeEmitter
}

/**
 * Polls registered MCP servers and updates `status` / `lastHealthCheckAt` /
 * `lastHealthError`. Same shape and atomic-claim model as AgentHealthPoller.
 *
 * Probe delegates to `MCPGateway.routineHealthProbe()` — for HTTP / SSE that
 * runs a real MCP `tools/list` round-trip via the pooled client (so liveness
 * reflects what callbacks will see); for stdio it checks `child.pid` is
 * alive in the pool or attempts a fresh spawn if the row is currently dark
 * (locked decision #23). Test Connection on the detail page calls the
 * heavier `healthCheck()` regardless of transport.
 *
 * Gated externally on `ENABLE_MCP_SERVERS=true`.
 */
export class MCPServerHealthPoller {
    private appDataSource: DataSource
    private mcpGateway: MCPGateway
    private catalogChangeEmitter?: CatalogChangeEmitter
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: MCPServerHealthPollerOptions) {
        this.appDataSource = options.appDataSource
        this.mcpGateway = options.mcpGateway
        this.catalogChangeEmitter = options.catalogChangeEmitter
    }

    public start(): void {
        if (this.intervalId) return

        const pollIntervalMs = process.env.MCP_SERVER_HEALTH_POLL_INTERVAL_MS
            ? parseInt(process.env.MCP_SERVER_HEALTH_POLL_INTERVAL_MS, 10)
            : DEFAULT_POLL_INTERVAL_MS

        logger.info(`Starting with ${pollIntervalMs}ms poll interval`)

        this.intervalId = setInterval(() => {
            this.poll()
        }, pollIntervalMs)

        this.poll()
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            logger.info('Stopped')
        }
    }

    private async poll(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const repo = this.appDataSource.getRepository(MCPServer)
            // All transports (`streamable-http` / `sse` / `stdio`) are polled.
            // Per-transport probe shape is owned by `MCPGateway.routineHealthProbe()`.
            const candidates = await repo
                .createQueryBuilder('mcp_server')
                .where('mcp_server.enabled = :enabled', { enabled: true })
                .andWhere('mcp_server.status <> :status', { status: MCPServerStatus.DISABLED })
                .andWhere('mcp_server.transport IN (:...transports)', {
                    transports: [MCPServerTransport.STREAMABLE_HTTP, MCPServerTransport.SSE, MCPServerTransport.STDIO]
                })
                .getMany()

            for (let i = 0; i < candidates.length; i += CONCURRENCY_CAP) {
                const batch = candidates.slice(i, i + CONCURRENCY_CAP)
                await Promise.allSettled(batch.map((server) => this.checkServerHealth(server)))
            }
        } catch (error) {
            logger.error('Poll failed:', { error })
        } finally {
            this.running = false
        }
    }

    /**
     * Atomic claim: stamp `lastHealthCheckAt` under a WHERE-equals predicate
     * matching the value we read. Same pattern as AgentHealthPoller.
     */
    private async tryClaimServer(server: MCPServer): Promise<boolean> {
        const claimedAt = new Date()
        const qb = this.appDataSource.getRepository(MCPServer).createQueryBuilder().update(MCPServer).set({ lastHealthCheckAt: claimedAt })
        const result = server.lastHealthCheckAt
            ? await qb
                  .where('id = :id AND "lastHealthCheckAt" = :previous', {
                      id: server.id,
                      previous: server.lastHealthCheckAt
                  })
                  .execute()
            : await qb.where('id = :id AND "lastHealthCheckAt" IS NULL', { id: server.id }).execute()
        return Boolean(result.affected && result.affected > 0)
    }

    private async checkServerHealth(server: MCPServer): Promise<void> {
        const claimed = await this.tryClaimServer(server)
        if (!claimed) return

        const repo = this.appDataSource.getRepository(MCPServer)
        const previousStatus = server.status
        let newStatus: MCPServerStatus

        // Transport-specific minimum-config check. Network transports need a
        // url; stdio needs a command. Either missing is an immediate UNHEALTHY
        // — never reaches the gateway.
        const isStdio = server.transport === MCPServerTransport.STDIO
        const missingConfig = isStdio ? !server.command : !server.url
        const missingConfigMessage = isStdio ? 'No command configured' : 'No url configured'

        if (missingConfig) {
            await repo.update(server.id, { status: MCPServerStatus.UNHEALTHY, lastHealthError: missingConfigMessage })
            newStatus = MCPServerStatus.UNHEALTHY
        } else {
            try {
                await this.mcpGateway.routineHealthProbe(server)
                await repo.update(server.id, { status: MCPServerStatus.HEALTHY, lastHealthError: null as any })
                newStatus = MCPServerStatus.HEALTHY
            } catch (error) {
                const message = getErrorMessage(error)
                const isTimeout = /timed?\s*out/i.test(message)
                await repo.update(server.id, {
                    status: MCPServerStatus.UNHEALTHY,
                    lastHealthError: isTimeout ? message : `Health check failed: ${message}`
                })
                newStatus = MCPServerStatus.UNHEALTHY
            }
        }

        // Catalog visibility for an agent depends on server health —
        // `listAllowedToolsEnriched` excludes UNHEALTHY servers. So a status
        // flip changes what every active session would see on next tools/list.
        // Emit only on real flip; no-op when status is unchanged.
        if (newStatus !== previousStatus) {
            this.catalogChangeEmitter?.emitGlobal()
        }
    }
}
