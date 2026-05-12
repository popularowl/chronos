import { DataSource } from 'typeorm'
import { Agent } from '../database/entities/Agent'
import { AgentRuntimeType, AgentStatus } from '../Interface'
import { getErrorMessage } from '../errors/utils'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('AgentHealthPoller')

const DEFAULT_POLL_INTERVAL_MS = 30000
const DEFAULT_HEALTH_TIMEOUT_MS = 5000
const CONCURRENCY_CAP = 10

interface AgentHealthPollerOptions {
    appDataSource: DataSource
}

/**
 * Polls registered HTTP agents on a configurable interval and updates their
 * `status` / `lastHealthCheckAt` / `lastHealthError` columns. Atomic-claim
 * via a stamp on `lastHealthCheckAt` keeps multi-instance deployments from
 * double-polling the same agent. Concurrency is capped at 10 in-flight
 * checks per pass via batched `Promise.allSettled`.
 *
 * Gated externally on `ENABLE_AGENTS=true` — the bootstrap only constructs
 * this when the flag is set.
 */
export class AgentHealthPoller {
    private appDataSource: DataSource
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: AgentHealthPollerOptions) {
        this.appDataSource = options.appDataSource
    }

    public start(): void {
        if (this.intervalId) return

        const pollIntervalMs = process.env.AGENT_HEALTH_POLL_INTERVAL_MS
            ? parseInt(process.env.AGENT_HEALTH_POLL_INTERVAL_MS, 10)
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
            const repo = this.appDataSource.getRepository(Agent)
            const candidates = await repo
                .createQueryBuilder('agent')
                .where('agent.runtimeType = :runtimeType', { runtimeType: AgentRuntimeType.HTTP })
                .andWhere('agent.enabled = :enabled', { enabled: true })
                .andWhere('agent.status <> :status', { status: AgentStatus.DISABLED })
                .getMany()

            for (let i = 0; i < candidates.length; i += CONCURRENCY_CAP) {
                const batch = candidates.slice(i, i + CONCURRENCY_CAP)
                await Promise.allSettled(batch.map((agent) => this.checkAgentHealth(agent)))
            }
        } catch (error) {
            logger.error('Poll failed:', { error })
        } finally {
            this.running = false
        }
    }

    /**
     * Atomic claim: stamp `lastHealthCheckAt` under a WHERE-equals predicate
     * matching the value we read. Only the instance whose UPDATE affects 1
     * row wins the lock; others bail and skip the check this round.
     */
    private async tryClaimAgent(agent: Agent): Promise<boolean> {
        const claimedAt = new Date()
        const qb = this.appDataSource.getRepository(Agent).createQueryBuilder().update(Agent).set({ lastHealthCheckAt: claimedAt })
        const result = agent.lastHealthCheckAt
            ? await qb.where('id = :id AND "lastHealthCheckAt" = :previous', { id: agent.id, previous: agent.lastHealthCheckAt }).execute()
            : await qb.where('id = :id AND "lastHealthCheckAt" IS NULL', { id: agent.id }).execute()
        return Boolean(result.affected && result.affected > 0)
    }

    private async checkAgentHealth(agent: Agent): Promise<void> {
        const claimed = await this.tryClaimAgent(agent)
        if (!claimed) return

        let cfg: any = {}
        if (agent.runtimeConfig) {
            try {
                cfg = JSON.parse(agent.runtimeConfig)
            } catch {
                /* fall through with empty cfg */
            }
        }
        const url: string | undefined = cfg.healthEndpoint || agent.serviceEndpoint
        const timeoutMs = typeof cfg.healthTimeoutMs === 'number' ? cfg.healthTimeoutMs : DEFAULT_HEALTH_TIMEOUT_MS

        const repo = this.appDataSource.getRepository(Agent)
        if (!url) {
            await repo.update(agent.id, {
                status: AgentStatus.UNHEALTHY,
                lastHealthError: 'No healthEndpoint or serviceEndpoint configured'
            })
            return
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const response = await fetch(url, { method: 'GET', signal: controller.signal })
            clearTimeout(timer)
            if (response.ok) {
                await repo.update(agent.id, { status: AgentStatus.HEALTHY, lastHealthError: null as any })
            } else {
                await repo.update(agent.id, {
                    status: AgentStatus.UNHEALTHY,
                    lastHealthError: `Health endpoint returned HTTP ${response.status}`
                })
            }
        } catch (error) {
            clearTimeout(timer)
            const isAbort = (error as any)?.name === 'AbortError'
            await repo.update(agent.id, {
                status: AgentStatus.UNHEALTHY,
                lastHealthError: isAbort ? `Health check timed out after ${timeoutMs}ms` : `Health check failed: ${getErrorMessage(error)}`
            })
        }
    }
}
