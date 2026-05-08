import { DataSource } from 'typeorm'
import { z } from 'zod'
import { StructuredTool } from '@langchain/core/tools'
import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../../src/Interface'

/**
 * MCP Registry Server — canvas tool node that exposes tools from a server
 * registered in the platform MCP Registry. Unlike the legacy Custom MCP node,
 * this one carries no URL / auth / transport in its config; the operator
 * registers the server once under MCP Servers in the sidebar and the agent
 * author picks an entry by id, then selects which actions to expose.
 *
 * At runtime each selected action becomes a LangChain StructuredTool whose
 * `_call` delegates to `mcpGateway.invoke()` instead of opening a private MCP
 * client. This routes through the platform's connection pool, credential
 * vault, audit table, and `Agent.allowedTools ∩ MCPServer.allowedTools`
 * intersection check — same path HTTP agents take via the callback endpoint.
 *
 * Wired through canvas options:
 * - `options.appDataSource`: typeorm DataSource (existing)
 * - `options.databaseEntities['MCPServer']` + `['Agent']`: entity classes
 *   (extended in v1.7 — see `packages/server/src/utils/index.ts`)
 * - `options.mcpGateway`: server-side `MCPGateway` instance
 *   (threaded in v1.7 — see `packages/server/src/utils/buildAgentflow.ts`
 *   and `packages/server/src/services/nodes/index.ts`)
 *
 * Allowed-tools enforcement: the gateway intersects `Agent.allowedTools`
 * (auto-derived from canvas on agentflow save — see `aggregateAllowedToolsFromCanvas`
 * in `agentflowsService`) with `MCPServer.allowedTools` (operator-side).
 * If the canvas-derived list hasn't been written yet, calls 403; users see
 * "Agent X is not permitted to call tool Y".
 */
class MCPRegistryServer implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    documentation: string
    inputs: INodeParams[]

    constructor() {
        this.label = 'MCP Registry Server'
        this.name = 'mcpRegistryServer'
        this.version = 1.0
        this.type = 'MCP Registry Tool'
        this.icon = 'mcpRegistryServer.png'
        this.category = 'Tools (MCP)'
        this.description =
            'Use tools from an MCP server registered in the platform MCP Registry. Credentials, transport, and auth are managed centrally — pick a server and the actions you want exposed.'
        this.documentation = 'https://intelligex.com/tutorials/mcp-registry'
        this.inputs = [
            {
                label: 'MCP Server',
                name: 'mcpServerId',
                type: 'asyncOptions',
                loadMethod: 'listMCPServers',
                description: 'Server registered under MCP Servers in the platform sidebar.'
            },
            {
                label: 'Available Actions',
                name: 'mcpActions',
                type: 'asyncMultiOptions',
                loadMethod: 'listActions',
                refresh: true
            }
        ]
        this.baseClasses = ['Tool']
    }

    //@ts-ignore
    loadMethods = {
        listMCPServers: async (_nodeData: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> => {
            const appDataSource = options.appDataSource as DataSource | undefined
            const databaseEntities = options.databaseEntities as IDatabaseEntity | undefined
            if (!appDataSource || !databaseEntities || !databaseEntities['MCPServer']) {
                return [{ label: 'MCP Registry not available — check ENABLE_MCP_SERVERS', name: '', description: '' }]
            }

            try {
                const servers = await appDataSource.getRepository(databaseEntities['MCPServer']).find({
                    where: { enabled: true }
                })
                if (!servers || servers.length === 0) {
                    return [
                        {
                            label: 'No MCP servers registered yet',
                            name: '',
                            description: 'Register one under MCP Servers in the sidebar before connecting it to an agent.'
                        }
                    ]
                }
                return servers.map((s: any) => ({
                    label: `${s.name} (${s.slug})`,
                    name: s.id,
                    description: s.description || `Transport: ${s.transport}`
                }))
            } catch (error) {
                return [{ label: 'Error loading MCP servers', name: '', description: (error as Error).message }]
            }
        },

        listActions: async (nodeData: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> => {
            const mcpServerId = nodeData.inputs?.mcpServerId as string | undefined
            if (!mcpServerId) return []

            const appDataSource = options.appDataSource as DataSource | undefined
            const databaseEntities = options.databaseEntities as IDatabaseEntity | undefined
            const mcpGateway = options.mcpGateway as MCPGatewayLike | undefined
            if (!appDataSource || !databaseEntities || !databaseEntities['MCPServer'] || !mcpGateway) {
                return [{ label: 'MCP Registry not available', name: '', description: 'Gateway disabled or entities not registered.' }]
            }

            try {
                const server = await appDataSource.getRepository(databaseEntities['MCPServer']).findOneBy({ id: mcpServerId })
                if (!server) {
                    return [{ label: 'Selected MCP server no longer exists', name: '', description: 'Pick a different server.' }]
                }

                const liveTools = await mcpGateway.listLiveTools(server)
                const sorted = [...liveTools].sort((a, b) => a.name.localeCompare(b.name))
                if (sorted.length === 0) {
                    return [{ label: 'Server has no tools published', name: '', description: 'Check the server status on /mcp-servers.' }]
                }
                return sorted.map((t) => ({
                    label: t.name,
                    name: t.name,
                    description: t.description || `Tool ${t.name} on ${(server as any).slug}`
                }))
            } catch (error) {
                return [
                    {
                        label: 'Could not reach server',
                        name: '',
                        description: `Check status on /mcp-servers: ${(error as Error).message}`
                    }
                ]
            }
        }
    }

    async init(nodeData: INodeData, _input: string, options: ICommonObject): Promise<any> {
        const mcpServerId = nodeData.inputs?.mcpServerId as string | undefined
        if (!mcpServerId) {
            throw new Error('MCP Registry Server: no MCP Server selected')
        }

        const appDataSource = options.appDataSource as DataSource | undefined
        const databaseEntities = options.databaseEntities as IDatabaseEntity | undefined
        const mcpGateway = options.mcpGateway as MCPGatewayLike | undefined
        if (!appDataSource || !databaseEntities || !databaseEntities['MCPServer'] || !databaseEntities['Agent']) {
            throw new Error('MCP Registry Server: appDataSource / databaseEntities not available')
        }
        if (!mcpGateway) {
            throw new Error('MCP Registry Server: MCP gateway not available — set ENABLE_MCP_SERVERS=true')
        }

        const selectedActions = parseSelectedActions(nodeData.inputs?.mcpActions)
        if (selectedActions.length === 0) return []

        const server: any = await appDataSource.getRepository(databaseEntities['MCPServer']).findOneBy({ id: mcpServerId })
        if (!server) {
            throw new Error(`MCP Registry Server: server ${mcpServerId} not found`)
        }

        const liveCatalog = await mcpGateway.listLiveTools(server)
        const agentflowid = options.agentflowid as string | undefined

        return selectedActions
            .filter((toolName) => liveCatalog.some((t) => t.name === toolName))
            .map((toolName) => {
                const live = liveCatalog.find((t) => t.name === toolName)!
                return new MCPRegistryTool({
                    serverSlug: (server as any).slug,
                    bareToolName: toolName,
                    description: live.description || `Tool ${toolName} on ${(server as any).slug}`,
                    inputSchema: live.inputSchema as Record<string, unknown> | undefined,
                    appDataSource,
                    agentEntity: databaseEntities['Agent'],
                    mcpGateway,
                    agentflowid
                })
            })
    }
}

/**
 * Tool name surfaced to the LLM. Anthropic rejects dots; we use underscores
 * so the same name works across all providers. Audit + gateway internals
 * keep using the dotted `<slug>.<tool>` form.
 */
const llmFacingName = (serverSlug: string, bareToolName: string) => `${serverSlug}_${bareToolName}`

const parseSelectedActions = (raw: unknown): string[] => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter((s) => typeof s === 'string' && s.length > 0)
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.length > 0) : []
        } catch {
            return []
        }
    }
    return []
}

const buildSchemaFromInputSchema = (inputSchema: Record<string, unknown> | undefined): z.ZodTypeAny => {
    // The gateway passes through whatever the agent sends; we only need a
    // permissive schema so LangChain doesn't reject the tool call before it
    // reaches us. Per-property typing happens upstream at the MCP server.
    if (!inputSchema || typeof inputSchema !== 'object') {
        return z.object({})
    }
    const properties = (inputSchema as { properties?: Record<string, unknown> }).properties
    if (!properties || typeof properties !== 'object') {
        return z.object({})
    }
    // The MCP server itself enforces required-vs-optional at call time. We
    // expose every property as `z.any().optional()` here so LangChain's
    // schema validation never blocks a call before it reaches the server —
    // the gateway is the authoritative validator.
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const key of Object.keys(properties)) {
        shape[key] = z.any().optional()
    }
    return z.object(shape)
}

interface MCPGatewayLike {
    invoke(agent: any, namespacedToolName: string, params: unknown, callContext?: { callId?: string }): Promise<unknown>
    listLiveTools(server: any): Promise<{ name: string; description?: string; inputSchema?: unknown }[]>
}

interface MCPRegistryToolOptions {
    serverSlug: string
    bareToolName: string
    description: string
    inputSchema: Record<string, unknown> | undefined
    appDataSource: DataSource
    agentEntity: any
    mcpGateway: MCPGatewayLike
    agentflowid?: string
}

class MCPRegistryTool extends StructuredTool {
    static lc_name() {
        return 'MCPRegistryTool'
    }

    name: string
    description: string
    schema: any

    private namespacedTool: string
    private appDataSource: DataSource
    private agentEntity: any
    private mcpGateway: MCPGatewayLike
    private agentflowid: string | undefined

    constructor(opts: MCPRegistryToolOptions) {
        super()
        this.namespacedTool = `${opts.serverSlug}.${opts.bareToolName}`
        this.name = llmFacingName(opts.serverSlug, opts.bareToolName)
        this.description = opts.description
        this.schema = buildSchemaFromInputSchema(opts.inputSchema)
        this.appDataSource = opts.appDataSource
        this.agentEntity = opts.agentEntity
        this.mcpGateway = opts.mcpGateway
        this.agentflowid = opts.agentflowid
    }

    protected async _call(input: any): Promise<string> {
        if (!this.agentflowid) {
            throw new Error(`MCP Registry Server: agentflowid not in scope; cannot resolve BUILT_IN agent for tool ${this.namespacedTool}`)
        }

        const agent = await this.appDataSource.getRepository(this.agentEntity).findOneBy({ builtinAgentflowId: this.agentflowid })
        if (!agent) {
            throw new Error(
                `MCP Registry Server: no BUILT_IN agent registered for agentflow ${this.agentflowid}; gateway invoke would fail intersection check`
            )
        }

        const result = await this.mcpGateway.invoke(agent, this.namespacedTool, input ?? {}, {})
        const content = (result as any)?.content
        return typeof content === 'string' ? content : JSON.stringify(content ?? result)
    }
}

module.exports = { nodeClass: MCPRegistryServer }
