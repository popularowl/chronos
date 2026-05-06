import { DataSource } from 'typeorm'
import { MCPServer } from '../database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../Interface'
import { getErrorMessage } from '../errors/utils'
import { MCPGateway } from '../services/mcp-gateway'
import logger from '../utils/logger'

const DEFAULT_POLL_INTERVAL_MS = 30000
const CONCURRENCY_CAP = 10

interface MCPServerHealthPollerOptions {
    appDataSource: DataSource
    mcpGateway: MCPGateway
}

/**
 * Polls registered MCP servers and updates `status` / `lastHealthCheckAt` /
 * `lastHealthError`. Same shape and atomic-claim model as AgentHealthPoller.
 *
 * Probe delegates to `MCPGateway.healthCheck()` — a real MCP `tools/list`
 * round-trip via the pooled client so liveness reflects what callbacks will
 * see. `stdio` transport is skipped (gateway does not support it yet).
 *
 * Gated externally on `ENABLE_MCP_SERVERS=true`.
 */
export class MCPServerHealthPoller {
    private appDataSource: DataSource
    private mcpGateway: MCPGateway
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: MCPServerHealthPollerOptions) {
        this.appDataSource = options.appDataSource
        this.mcpGateway = options.mcpGateway
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

        try {
            await this.mcpGateway.healthCheck(server)
            await repo.update(server.id, { status: MCPServerStatus.HEALTHY, lastHealthError: null as any })
        } catch (error) {
            const message = getErrorMessage(error)
            const isTimeout = /timed?\s*out/i.test(message)
            await repo.update(server.id, {
                status: MCPServerStatus.UNHEALTHY,
                lastHealthError: isTimeout ? message : `Health check failed: ${message}`
            })
        }
    }
}
