import { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createModuleLogger } from '../../utils/logger'
import { getErrorMessage } from '../../errors/utils'

const logger = createModuleLogger('MCPGatewaySessionStore')

const DEFAULT_IDLE_TIMEOUT_MS = 300000
const DEFAULT_MAX_SESSIONS_PER_AGENT = 50
const SWEEPER_INTERVAL_MS = 60000

export interface MCPSession {
    id: string
    agentId: string
    transport: StreamableHTTPServerTransport
    server: McpProtocolServer
    createdAt: number
    lastActivityAt: number
}

export interface SessionStoreOptions {
    idleTimeoutMs?: number
    maxSessionsPerAgent?: number
    sweeperIntervalMs?: number
}

/**
 * Single-instance, in-memory MCP session store. Maps SDK-generated session IDs
 * to live `Server` + `Transport` pairs. Sweeper closes idle sessions every
 * SWEEPER_INTERVAL_MS; cap enforced per `agentId` so a runaway agent cannot
 * open unbounded sessions. Worker-mode (Redis-backed) storage will replace
 * this in a future release for multi-instance deployments.
 */
export class MCPGatewaySessionStore {
    private sessions = new Map<string, MCPSession>()
    private byAgent = new Map<string, Set<string>>()
    private sweeperId: ReturnType<typeof setInterval> | null = null
    private readonly idleTimeoutMs: number
    private readonly maxSessionsPerAgent: number
    private readonly sweeperIntervalMs: number

    constructor(options: SessionStoreOptions = {}) {
        this.idleTimeoutMs =
            options.idleTimeoutMs ??
            (process.env.MCP_GATEWAY_SESSION_IDLE_TIMEOUT_MS
                ? parseInt(process.env.MCP_GATEWAY_SESSION_IDLE_TIMEOUT_MS, 10)
                : DEFAULT_IDLE_TIMEOUT_MS)
        this.maxSessionsPerAgent =
            options.maxSessionsPerAgent ??
            (process.env.MCP_GATEWAY_MAX_SESSIONS_PER_AGENT
                ? parseInt(process.env.MCP_GATEWAY_MAX_SESSIONS_PER_AGENT, 10)
                : DEFAULT_MAX_SESSIONS_PER_AGENT)
        this.sweeperIntervalMs = options.sweeperIntervalMs ?? SWEEPER_INTERVAL_MS
    }

    public start(): void {
        if (this.sweeperId) return
        logger.info(
            `Starting (idleTimeoutMs=${this.idleTimeoutMs}, maxSessionsPerAgent=${this.maxSessionsPerAgent}, sweeperIntervalMs=${this.sweeperIntervalMs})`
        )
        this.sweeperId = setInterval(() => this.sweep(), this.sweeperIntervalMs)
    }

    public async stop(): Promise<void> {
        if (this.sweeperId) {
            clearInterval(this.sweeperId)
            this.sweeperId = null
        }
        const all = Array.from(this.sessions.values())
        this.sessions.clear()
        this.byAgent.clear()
        for (const session of all) {
            await this.closeSession(session).catch((error) => {
                logger.warn(`Failed to close session ${session.id}: ${getErrorMessage(error)}`)
            })
        }
        logger.info('Stopped')
    }

    public get(sessionId: string): MCPSession | undefined {
        const session = this.sessions.get(sessionId)
        if (session) session.lastActivityAt = Date.now()
        return session
    }

    /**
     * Throws if the per-agent cap is at limit. Caller surfaces this as
     * 429 Too Many Sessions on `initialize`.
     */
    public assertCanRegister(agentId: string): void {
        const set = this.byAgent.get(agentId)
        if (set && set.size >= this.maxSessionsPerAgent) {
            throw new SessionCapExceededError(agentId, this.maxSessionsPerAgent)
        }
    }

    public register(session: MCPSession, options: { extraOnClose?: () => void } = {}): void {
        this.sessions.set(session.id, session)
        const set = this.byAgent.get(session.agentId) ?? new Set<string>()
        set.add(session.id)
        this.byAgent.set(session.agentId, set)
        // Wire the SDK's transport-close callback so a client-initiated close
        // (or transport-level error) cleans up our store too. `extraOnClose`
        // runs first so callers can release per-session resources (e.g.
        // catalog-change subscriptions) before the session record disappears.
        session.transport.onclose = () => {
            try {
                options.extraOnClose?.()
            } catch (error) {
                logger.warn(`extraOnClose threw on session ${session.id}: ${getErrorMessage(error)}`)
            }
            this.unregister(session.id)
        }
    }

    public unregister(sessionId: string): void {
        const session = this.sessions.get(sessionId)
        if (!session) return
        this.sessions.delete(sessionId)
        const set = this.byAgent.get(session.agentId)
        if (set) {
            set.delete(sessionId)
            if (set.size === 0) this.byAgent.delete(session.agentId)
        }
    }

    /** Test seam: count live sessions. */
    public size(): number {
        return this.sessions.size
    }

    /** Test seam: count live sessions for a single agent. */
    public sizeForAgent(agentId: string): number {
        return this.byAgent.get(agentId)?.size ?? 0
    }

    private sweep(): void {
        const cutoff = Date.now() - this.idleTimeoutMs
        const stale: MCPSession[] = []
        for (const session of this.sessions.values()) {
            if (session.lastActivityAt < cutoff) stale.push(session)
        }
        for (const session of stale) {
            void this.closeSession(session).catch((error) => {
                logger.warn(`Failed to close idle session ${session.id}: ${getErrorMessage(error)}`)
            })
        }
        if (stale.length > 0) {
            logger.info(`Reaped ${stale.length} idle MCP session(s)`)
        }
    }

    private async closeSession(session: MCPSession): Promise<void> {
        this.unregister(session.id)
        try {
            await session.transport.close()
        } catch (error) {
            logger.warn(`transport.close threw on session ${session.id}: ${getErrorMessage(error)}`)
        }
    }
}

export class SessionCapExceededError extends Error {
    public readonly agentId: string
    public readonly limit: number
    constructor(agentId: string, limit: number) {
        super(`Agent ${agentId} has reached the maximum of ${limit} concurrent MCP sessions`)
        this.name = 'SessionCapExceededError'
        this.agentId = agentId
        this.limit = limit
    }
}
