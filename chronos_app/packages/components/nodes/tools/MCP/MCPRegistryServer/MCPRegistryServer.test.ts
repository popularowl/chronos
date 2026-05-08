const { nodeClass: MCPRegistryServer_Tool } = require('./MCPRegistryServer')
import { INodeData } from '../../../../src/Interface'

const createNodeData = (id: string, inputs: any): INodeData => ({
    id,
    label: 'MCP Registry Server',
    name: 'mcpRegistryServer',
    type: 'MCP Registry Tool',
    icon: 'mcpRegistryServer.png',
    version: 1.0,
    category: 'Tools (MCP)',
    baseClasses: ['Tool'],
    inputs
})

const fakeServer = {
    id: 'srv-uuid-1',
    name: 'GitHub',
    slug: 'github',
    description: 'GitHub MCP',
    transport: 'streamable-http',
    enabled: true
}

const fakeServerB = {
    id: 'srv-uuid-2',
    name: 'Slack',
    slug: 'slack',
    description: undefined,
    transport: 'streamable-http',
    enabled: true
}

const makeRepo = (rows: any[]) => ({
    find: jest.fn(async () => rows),
    findOneBy: jest.fn(async (where: any) => {
        const keys = Object.keys(where ?? {})
        return rows.find((r) => keys.every((k) => r[k] === where[k])) ?? null
    })
})

const makeOptions = (overrides: any = {}) => {
    const serverRepo = overrides.mcpServerRepo ?? makeRepo([fakeServer, fakeServerB])
    const agentRepo =
        overrides.agentRepo ??
        makeRepo([{ id: 'agent-uuid-1', slug: 'my-agent', allowedTools: '[]', builtinAgentflowId: 'agentflow-uuid-1' }])
    return {
        appDataSource: {
            getRepository: (entity: any) => {
                if (entity === 'MCPServer' || entity === fakeServer.constructor) return serverRepo
                if (entity === 'Agent') return agentRepo
                return serverRepo
            }
        },
        databaseEntities: {
            MCPServer: 'MCPServer',
            Agent: 'Agent'
        },
        mcpGateway: overrides.mcpGateway ?? {
            listLiveTools: jest.fn(async () => [
                {
                    name: 'create_issue',
                    description: 'Create an issue',
                    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } } }
                },
                { name: 'search', description: 'Search the repo' }
            ]),
            invoke: jest.fn(async () => ({ content: 'ok' }))
        },
        agentflowid: overrides.agentflowid ?? 'agentflow-uuid-1',
        ...overrides
    }
}

describe('MCPRegistryServer', () => {
    let nodeClass: any
    beforeEach(() => {
        nodeClass = new MCPRegistryServer_Tool()
    })

    describe('listMCPServers', () => {
        it('returns formatted entries for enabled servers', async () => {
            const options = makeOptions()
            const result = await nodeClass.loadMethods.listMCPServers(createNodeData('n1', {}), options)
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                label: 'GitHub (github)',
                name: 'srv-uuid-1',
                description: 'GitHub MCP'
            })
            expect(result[1].description).toBe('Transport: streamable-http')
        })

        it('returns hint when MCP entities are not registered (gateway disabled)', async () => {
            const result = await nodeClass.loadMethods.listMCPServers(createNodeData('n1', {}), { appDataSource: {}, databaseEntities: {} })
            expect(result).toHaveLength(1)
            expect(result[0].label).toMatch(/MCP Registry not available/)
        })

        it('returns hint when no servers are registered', async () => {
            const options = makeOptions({ mcpServerRepo: makeRepo([]) })
            const result = await nodeClass.loadMethods.listMCPServers(createNodeData('n1', {}), options)
            expect(result).toHaveLength(1)
            expect(result[0].label).toMatch(/No MCP servers registered/)
        })
    })

    describe('listActions', () => {
        it('returns empty when no server picked', async () => {
            const options = makeOptions()
            const result = await nodeClass.loadMethods.listActions(createNodeData('n1', { mcpServerId: '' }), options)
            expect(result).toEqual([])
        })

        it('calls listLiveTools and maps results sorted', async () => {
            const options = makeOptions()
            const result = await nodeClass.loadMethods.listActions(createNodeData('n1', { mcpServerId: 'srv-uuid-1' }), options)
            expect(options.mcpGateway.listLiveTools).toHaveBeenCalledWith(expect.objectContaining({ id: 'srv-uuid-1' }))
            expect(result.map((r: any) => r.name)).toEqual(['create_issue', 'search'])
            expect(result[0].description).toBe('Create an issue')
        })

        it('returns hint on probe failure', async () => {
            const options = makeOptions({
                mcpGateway: {
                    listLiveTools: jest.fn(async () => {
                        throw new Error('connection refused')
                    }),
                    invoke: jest.fn()
                }
            })
            const result = await nodeClass.loadMethods.listActions(createNodeData('n1', { mcpServerId: 'srv-uuid-1' }), options)
            expect(result).toHaveLength(1)
            expect(result[0].label).toMatch(/Could not reach server/)
            expect(result[0].description).toMatch(/connection refused/)
        })
    })

    describe('init', () => {
        it('throws when mcpServerId is missing', async () => {
            const options = makeOptions()
            await expect(nodeClass.init(createNodeData('n1', {}), '', options)).rejects.toThrow(/no MCP Server selected/)
        })

        it('returns N tool wrappers matching selected actions found in the live catalog', async () => {
            const options = makeOptions()
            const tools = await nodeClass.init(
                createNodeData('n1', {
                    mcpServerId: 'srv-uuid-1',
                    mcpActions: ['create_issue', 'search', 'unknown_action']
                }),
                '',
                options
            )
            expect(tools).toHaveLength(2)
            expect(tools[0].name).toBe('github_create_issue')
            expect(tools[1].name).toBe('github_search')
        })

        it('returns empty array when mcpActions is empty', async () => {
            const options = makeOptions()
            const tools = await nodeClass.init(createNodeData('n1', { mcpServerId: 'srv-uuid-1', mcpActions: [] }), '', options)
            expect(tools).toEqual([])
        })

        it('built tool delegates to mcpGateway.invoke with namespaced tool name + agent', async () => {
            const options = makeOptions()
            const tools = await nodeClass.init(
                createNodeData('n1', { mcpServerId: 'srv-uuid-1', mcpActions: ['create_issue'] }),
                '',
                options
            )
            const result = await tools[0].invoke({ title: 'Bug' })
            expect(options.mcpGateway.invoke).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'agent-uuid-1', slug: 'my-agent' }),
                'github.create_issue',
                { title: 'Bug' },
                expect.any(Object)
            )
            expect(typeof result).toBe('string')
        })
    })
})
