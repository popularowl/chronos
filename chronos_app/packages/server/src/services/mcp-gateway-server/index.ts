// The low-level `Server` class is marked deprecated by the SDK in favour of
// the higher-level `McpServer`. We deliberately use `Server` because our tool
// catalog is dynamic per session (stitched live from registered MCP servers)
// — the high-level API expects tool registrations at construction time.
import { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'crypto'
import { Agent } from '../../database/entities/Agent'
import { MCPGateway } from '../mcp-gateway'
import { getServerVersion } from '../../utils/version'
import { createModuleLogger } from '../../utils/logger'
import { getErrorMessage } from '../../errors/utils'
import { CatalogChangeEmitter } from './catalogChangeEmitter'
import { mapInvokeError } from './errorMapping'
import { MCPGatewaySessionStore, MCPSession } from './sessionStore'

export { MCPGatewaySessionStore, SessionCapExceededError } from './sessionStore'
export { CatalogChangeEmitter } from './catalogChangeEmitter'
export type { MCPSession, SessionStoreOptions } from './sessionStore'
export type { CatalogChangeUnsubscribe, CatalogChangeHandler } from './catalogChangeEmitter'

const logger = createModuleLogger('MCPGatewayServer')

const SERVER_NAME = 'chronos-mcp-gateway'
const TOOLS_LIST_CHANGED_METHOD = 'notifications/tools/list_changed'

/**
 * Build a fresh MCP `Server` instance scoped to a single agent. Handlers close
 * over `agent` and the shared `MCPGateway` core; one `Server` per active MCP
 * session (matches the StreamableHTTPServerTransport lifecycle).
 *
 * The MCP `serverInfo.version` is the running Chronos package version so
 * clients can pin / check compatibility against a real release.
 *
 * Capabilities advertise `tools.listChanged: true` so the client subscribes
 * to `notifications/tools/list_changed` server pushes. The push fanout itself
 * (emitting on operator-initiated catalog changes) is wired separately and
 * will arrive in a follow-up release.
 */
export const createMcpGatewayServer = (input: { agent: Agent; gateway: MCPGateway }) => {
    const { agent, gateway } = input

    const server = new McpProtocolServer(
        { name: SERVER_NAME, version: getServerVersion() },
        {
            capabilities: { tools: { listChanged: true } },
            // Coalesce rapid sequential `tools/list_changed` emits within the
            // same event-loop tick into a single push. Operators editing
            // multiple servers in quick succession won't spam the agent.
            debouncedNotificationMethods: [TOOLS_LIST_CHANGED_METHOD]
        }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const tools = await gateway.listAllowedToolsEnriched(agent)
        return {
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} }
            }))
        }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args, _meta } = request.params
        const callId = typeof _meta?.chronosCallId === 'string' && _meta.chronosCallId.length > 0 ? _meta.chronosCallId : randomUUID()
        try {
            const result = (await gateway.invoke(agent, name, args ?? {}, { callId })) as {
                content?: Array<unknown>
                isError?: boolean
            }
            return {
                content: Array.isArray(result.content) ? result.content : [],
                isError: Boolean(result.isError)
            } as never
        } catch (error) {
            const mapping = mapInvokeError(error)
            if (mapping.kind === 'jsonRpcError') {
                throw mapping.error
            }
            return mapping.result as never
        }
    })

    return server
}

/**
 * Push `notifications/tools/list_changed` to a single session. Best-effort —
 * if the transport is closed mid-push, the SDK throws and we just log; the
 * session is already on its way out via the onclose chain.
 */
export const pushListChanged = async (session: MCPSession): Promise<void> => {
    try {
        await session.server.notification({ method: TOOLS_LIST_CHANGED_METHOD })
    } catch (error) {
        logger.warn(`Failed to push ${TOOLS_LIST_CHANGED_METHOD} for session ${session.id}: ${getErrorMessage(error)}`)
    }
}

/**
 * Create a session for a fresh `Mcp-Session-Id`, wire the SDK transport to
 * the per-session `Server`, and register with the store. Subscribes to the
 * catalog-change bus on both per-agent and global channels; either firing
 * pushes `notifications/tools/list_changed` to the client. Subscriptions
 * are chained into the transport-close cleanup so they release with the
 * session. Caller is the route handler.
 */
export const openSession = async (input: {
    agent: Agent
    gateway: MCPGateway
    sessionStore: MCPGatewaySessionStore
    catalogChangeEmitter?: CatalogChangeEmitter
}): Promise<MCPSession> => {
    const { agent, gateway, sessionStore, catalogChangeEmitter } = input

    sessionStore.assertCanRegister(agent.id)

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
    })
    const server = createMcpGatewayServer({ agent, gateway })
    await server.connect(transport)

    const sessionId = transport.sessionId
    if (!sessionId) {
        // Should never happen in stateful mode (sessionIdGenerator above forces
        // ID assignment), but the SDK type allows undefined for stateless mode.
        await transport.close().catch(() => {
            /* noop */
        })
        throw new Error('Transport did not assign a session id')
    }

    const session: MCPSession = {
        id: sessionId,
        agentId: agent.id,
        transport,
        server,
        createdAt: Date.now(),
        lastActivityAt: Date.now()
    }

    const unsubscribers: Array<() => void> = []
    if (catalogChangeEmitter) {
        const handler = () => {
            void pushListChanged(session)
        }
        unsubscribers.push(catalogChangeEmitter.subscribeAgent(agent.id, handler))
        unsubscribers.push(catalogChangeEmitter.subscribeGlobal(handler))
    }

    sessionStore.register(session, {
        extraOnClose: () => {
            for (const unsub of unsubscribers) {
                try {
                    unsub()
                } catch (error) {
                    logger.warn(`Failed to unsubscribe session ${sessionId}: ${getErrorMessage(error)}`)
                }
            }
        }
    })
    return session
}
