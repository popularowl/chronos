import { DataSource } from 'typeorm'
import { MCPServer } from '../database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../Interface'
import { getErrorMessage } from '../errors/utils'
import logger from '../utils/logger'

const DEFAULT_POLL_INTERVAL_MS = 30000
const DEFAULT_HEALTH_TIMEOUT_MS = 5000
const CONCURRENCY_CAP = 10

interface MCPServerHealthPollerOptions {
    appDataSource: DataSource
}

/**
 * Polls registered MCP servers and updates `status` / `lastHealthCheckAt` /
 * `lastHealthError`. Same shape and atomic-claim model as AgentHealthPoller.
 *
 * v1.6 note: the probe is a plain HTTP GET against `mcpServer.url` — the
 * full MCP `tools/list` round-trip arrives with the gateway in Group D
 * (it requires the connection-pool model). `stdio` transport is skipped
 * entirely; v1.8 picks it up.
 *
 * Gated externally on `ENABLE_MCP_SERVERS=true`.
 */
export class MCPServerHealthPoller {
    private appDataSource: DataSource
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: MCPServerHealthPollerOptions) {
        this.appDataSource = options.appDataSource
    }

    public start(): void {
        if (this.intervalId) return

        const pollIntervalMs = process.env.MCP_SERVER_HEALTH_POLL_INTERVAL_MS
            ? parseInt(process.env.MCP_SERVER_HEALTH_POLL_INTERVAL_MS, 10)
            : DEFAULT_POLL_INTERVAL_MS

        logger.info(`🩺 [MCPServerHealthPoller] Starting with ${pollIntervalMs}ms poll interval`)

        this.intervalId = setInterval(() => {
            this.poll()
        }, pollIntervalMs)

        this.poll()
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            logger.info('🩺 [MCPServerHealthPoller] Stopped')
        }
    }

    private async poll(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const repo = this.appDataSource.getRepository(MCPServer)
            const candidates = await repo
                .createQueryBuilder('mcp_server')
                .where('mcp_server.enabled = :enabled', { enabled: true })
                .andWhere('mcp_server.status <> :status', { status: MCPServerStatus.DISABLED })
                .andWhere('mcp_server.transport IN (:...transports)', {
                    transports: [MCPServerTransport.STREAMABLE_HTTP, MCPServerTransport.SSE]
                })
                .getMany()

            for (let i = 0; i < candidates.length; i += CONCURRENCY_CAP) {
                const batch = candidates.slice(i, i + CONCURRENCY_CAP)
                await Promise.allSettled(batch.map((server) => this.checkServerHealth(server)))
            }
        } catch (error) {
            logger.error('[MCPServerHealthPoller] Poll failed:', { error })
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
        if (!server.url) {
            await repo.update(server.id, { status: MCPServerStatus.UNHEALTHY, lastHealthError: 'No url configured' })
            return
        }

        // TODO(v1.8): swap to MCP `tools/list` over the connection-pool client
        // once Group D's gateway lands. Plain HTTP GET reachability is the
        // best signal we have without spinning up a full MCP client per pass.
        const timeoutMs =
            typeof server.timeoutMs === 'number' ? Math.min(server.timeoutMs, DEFAULT_HEALTH_TIMEOUT_MS) : DEFAULT_HEALTH_TIMEOUT_MS
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const response = await fetch(server.url, { method: 'GET', signal: controller.signal })
            clearTimeout(timer)
            if (response.ok) {
                await repo.update(server.id, { status: MCPServerStatus.HEALTHY, lastHealthError: null as any })
            } else {
                await repo.update(server.id, {
                    status: MCPServerStatus.UNHEALTHY,
                    lastHealthError: `MCP server endpoint returned HTTP ${response.status}`
                })
            }
        } catch (error) {
            clearTimeout(timer)
            const isAbort = (error as any)?.name === 'AbortError'
            await repo.update(server.id, {
                status: MCPServerStatus.UNHEALTHY,
                lastHealthError: isAbort ? `Health check timed out after ${timeoutMs}ms` : `Health check failed: ${getErrorMessage(error)}`
            })
        }
    }
}
