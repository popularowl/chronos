import { EventEmitter } from 'events'
import { createModuleLogger } from '../../utils/logger'

const logger = createModuleLogger('CatalogChangeEmitter')

const GLOBAL_EVENT = 'global:tools-changed'
const agentEvent = (agentId: string): string => `agent:${agentId}:tools-changed`

export type CatalogChangeUnsubscribe = () => void
export type CatalogChangeHandler = () => void | Promise<void>

/**
 * In-process pub/sub for MCP catalog-change notifications. The bus that fans
 * `notifications/tools/list_changed` out to active MCP sessions when operators
 * mutate `Agent.allowedTools`, `MCPServer.*`, or when the health poller flips
 * a server status.
 *
 * Two channels:
 *   - per-agent: `emitForAgent(agentId)` — fires only the named agent's channel.
 *     Used when `Agent.allowedTools` changes (only that agent's sessions care).
 *   - global:   `emitGlobal()` — fires the global channel. Used for any
 *     MCPServer-level mutation (registration, allowedTools change, enabled
 *     toggle, delete, health flip) since the affected agent set is unbounded
 *     in the worst case and re-fetching `tools/list` is cheap.
 *
 * Sessions subscribe to BOTH channels in `openSession`. Either firing causes
 * the session to push `notifications/tools/list_changed`. The MCP SDK's
 * `debouncedNotificationMethods: ['notifications/tools/list_changed']`
 * coalesces multiple emits within the same event-loop tick into one push,
 * so rapid sequential emits don't spam the agent.
 *
 * Single-instance only — worker-mode (Redis pub/sub) replaces this in a
 * future patch release. The interface stays the same.
 */
export class CatalogChangeEmitter {
    private emitter = new EventEmitter()

    constructor() {
        // Subscriber count is bounded by MCP_GATEWAY_MAX_SESSIONS_PER_AGENT
        // for per-agent channels (default 50), and by total active sessions
        // for the global channel. The default Node max-listeners warning at
        // 10 fires too eagerly; disable the warning since we cap externally.
        this.emitter.setMaxListeners(0)
    }

    public emitForAgent(agentId: string): void {
        if (!agentId) return
        const event = agentEvent(agentId)
        const count = this.emitter.listenerCount(event)
        if (count === 0) return // no active sessions for this agent
        logger.debug(`emitForAgent(${agentId}) -> ${count} listener(s)`)
        this.emitter.emit(event)
    }

    public emitGlobal(): void {
        const count = this.emitter.listenerCount(GLOBAL_EVENT)
        if (count === 0) return
        logger.debug(`emitGlobal() -> ${count} listener(s)`)
        this.emitter.emit(GLOBAL_EVENT)
    }

    public subscribeAgent(agentId: string, handler: CatalogChangeHandler): CatalogChangeUnsubscribe {
        const event = agentEvent(agentId)
        this.emitter.on(event, handler)
        return () => this.emitter.off(event, handler)
    }

    public subscribeGlobal(handler: CatalogChangeHandler): CatalogChangeUnsubscribe {
        this.emitter.on(GLOBAL_EVENT, handler)
        return () => this.emitter.off(GLOBAL_EVENT, handler)
    }

    /** Test seam: count subscribers on a named channel. */
    public listenerCount(channel: 'global' | { agentId: string }): number {
        const event = channel === 'global' ? GLOBAL_EVENT : agentEvent(channel.agentId)
        return this.emitter.listenerCount(event)
    }
}
