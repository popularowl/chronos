import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for MCPServers service (v1.6.0).
 * Covers CRUD, validation (URL/SSRF, transport-specific required fields),
 * slug uniqueness, toggle status transitions, and the ENABLE_MCP_SERVERS gate.
 */
export function mcpServersServiceTest() {
    describe('MCPServers Service', () => {
        let mcpServersService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
        }

        beforeAll(() => {
            jest.resetModules()
            process.env.ENABLE_MCP_SERVERS = 'true'
            delete process.env.ALLOW_LOOPBACK_AGENTS

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: { getRepository: jest.fn().mockReturnValue(mockRepository) }
            }

            setupMocks()
            mcpServersService = require('../../src/services/mcp-servers').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockRepository.findOneBy.mockResolvedValue(null)
        })

        // ─── feature flag ──────────────────────────────────────────────

        describe('ENABLE_MCP_SERVERS gate', () => {
            it('blocks createMCPServer when disabled', async () => {
                const original = process.env.ENABLE_MCP_SERVERS
                process.env.ENABLE_MCP_SERVERS = 'false'
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                const disabled = require('../../src/services/mcp-servers').default
                await expect(
                    disabled.createMCPServer({
                        name: 'pg',
                        transport: 'streamable-http',
                        url: 'https://example.com'
                    })
                ).rejects.toMatchObject({ statusCode: 503 })
                process.env.ENABLE_MCP_SERVERS = original
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                mcpServersService = require('../../src/services/mcp-servers').default
            })
        })

        // ─── createMCPServer ───────────────────────────────────────────

        describe('createMCPServer', () => {
            it('creates a streamable-http server with default timeout and UNKNOWN status', async () => {
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 's1', ...entity }))

                const result = await mcpServersService.createMCPServer({
                    name: 'Postgres MCP',
                    transport: 'streamable-http',
                    url: 'https://mcp.example.com'
                })

                expect(result.id).toBe('s1')
                expect(result.transport).toBe('streamable-http')
                expect(result.status).toBe('UNKNOWN')
                expect(result.timeoutMs).toBe(30000)
                expect(result.enabled).toBe(true)
            })

            it('rejects request without name', async () => {
                await expect(
                    mcpServersService.createMCPServer({ transport: 'streamable-http', url: 'https://example.com' })
                ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('name') })
            })

            it('rejects request without transport', async () => {
                await expect(mcpServersService.createMCPServer({ name: 'x' })).rejects.toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('transport')
                })
            })

            it('rejects unknown transport value', async () => {
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'websocket', url: 'https://example.com' })
                ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Invalid transport') })
            })

            it('rejects stdio transport with 501 (reserved in v1.6)', async () => {
                await expect(mcpServersService.createMCPServer({ name: 'x', transport: 'stdio' })).rejects.toMatchObject({
                    statusCode: 501,
                    message: expect.stringContaining('stdio')
                })
            })

            it('rejects streamable-http server without url', async () => {
                await expect(mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http' })).rejects.toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('url')
                })
            })

            it('rejects sse server without url', async () => {
                await expect(mcpServersService.createMCPServer({ name: 'x', transport: 'sse' })).rejects.toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('url')
                })
            })

            it('rejects URL with non-http(s) protocol', async () => {
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http', url: 'ftp://example.com' })
                ).rejects.toMatchObject({ statusCode: 400 })
            })

            it('rejects loopback URL by default (SSRF guard)', async () => {
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http', url: 'http://127.0.0.1:8080' })
                ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('loopback') })
            })

            it('rejects RFC1918 / private IPs', async () => {
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http', url: 'http://10.0.0.5' })
                ).rejects.toMatchObject({ statusCode: 400 })
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http', url: 'http://192.168.1.1' })
                ).rejects.toMatchObject({ statusCode: 400 })
                await expect(
                    mcpServersService.createMCPServer({ name: 'x', transport: 'streamable-http', url: 'http://172.20.0.1' })
                ).rejects.toMatchObject({ statusCode: 400 })
            })

            it('allows loopback when ALLOW_LOOPBACK_AGENTS=true', async () => {
                process.env.ALLOW_LOOPBACK_AGENTS = 'true'
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                const allowed = require('../../src/services/mcp-servers').default
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 's', ...entity }))
                const result = await allowed.createMCPServer({
                    name: 'local',
                    transport: 'streamable-http',
                    url: 'http://localhost:8080'
                })
                expect(result.url).toBe('http://localhost:8080')
                delete process.env.ALLOW_LOOPBACK_AGENTS
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                mcpServersService = require('../../src/services/mcp-servers').default
            })

            it('serialises allowedTools and requestHeaders as JSON strings', async () => {
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 's', ...entity }))
                const result = await mcpServersService.createMCPServer({
                    name: 'rich',
                    transport: 'streamable-http',
                    url: 'https://mcp.example.com',
                    allowedTools: ['query', 'create_issue'],
                    requestHeaders: { 'X-Tenant': 'acme' }
                })
                expect(typeof result.allowedTools).toBe('string')
                expect(JSON.parse(result.allowedTools)).toEqual(['query', 'create_issue'])
                expect(typeof result.requestHeaders).toBe('string')
                expect(JSON.parse(result.requestHeaders)['X-Tenant']).toBe('acme')
            })

            it('appends -1 suffix on slug collision', async () => {
                let calls = 0
                mockRepository.findOneBy.mockImplementation(({ slug }: any) => {
                    if (!slug) return Promise.resolve(null)
                    calls++
                    if (calls === 1) return Promise.resolve({ id: 'taken' })
                    return Promise.resolve(null)
                })
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 's', ...entity }))
                const result = await mcpServersService.createMCPServer({
                    name: 'collide',
                    slug: 'collide',
                    transport: 'streamable-http',
                    url: 'https://mcp.example.com'
                })
                expect(result.slug).toBe('collide-1')
            })
        })

        // ─── toggleMCPServer ───────────────────────────────────────────

        describe('toggleMCPServer', () => {
            it('disables and sets status=DISABLED', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 's1', enabled: true, status: 'HEALTHY' })
                mockRepository.save.mockImplementation((e: any) => Promise.resolve(e))
                const result = await mcpServersService.toggleMCPServer('s1', false)
                expect(result.enabled).toBe(false)
                expect(result.status).toBe('DISABLED')
            })

            it('re-enables a previously DISABLED server and resets to UNKNOWN', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 's1', enabled: false, status: 'DISABLED' })
                mockRepository.save.mockImplementation((e: any) => Promise.resolve(e))
                const result = await mcpServersService.toggleMCPServer('s1', true)
                expect(result.enabled).toBe(true)
                expect(result.status).toBe('UNKNOWN')
            })

            it('returns 404 when server not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)
                await expect(mcpServersService.toggleMCPServer('missing', true)).rejects.toMatchObject({ statusCode: 404 })
            })
        })

        // ─── getAllMCPServers filters ──────────────────────────────────

        describe('getAllMCPServers', () => {
            it('applies transport and status filters', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])
                await mcpServersService.getAllMCPServers(-1, -1, { transport: 'streamable-http', status: 'HEALTHY' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mcp_server.transport = :transport', {
                    transport: 'streamable-http'
                })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mcp_server.status = :status', { status: 'HEALTHY' })
            })

            it('returns paginated payload when page+limit provided', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: 's' }], 1])
                const result = await mcpServersService.getAllMCPServers(1, 10)
                expect(result).toEqual({ data: [{ id: 's' }], total: 1 })
            })

            it('returns array when no pagination', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: 's' }], 1])
                const result = await mcpServersService.getAllMCPServers()
                expect(result).toEqual([{ id: 's' }])
            })
        })

        // ─── listMCPServerTools (live tools/list) ──────────────────────

        describe('listMCPServerTools', () => {
            const baseServer = (overrides: any = {}) => ({
                id: 's-1',
                slug: 'postgres',
                transport: 'streamable-http',
                url: 'https://mcp.example.com',
                enabled: true,
                ...overrides
            })

            it('returns 404 when server not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)
                await expect(mcpServersService.listMCPServerTools('missing')).rejects.toMatchObject({ statusCode: 404 })
            })

            it('returns 409 when server is disabled', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer({ enabled: false }))
                await expect(mcpServersService.listMCPServerTools('s-1')).rejects.toMatchObject({ statusCode: 409 })
            })

            it('returns 501 for stdio transport', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer({ transport: 'stdio' }))
                await expect(mcpServersService.listMCPServerTools('s-1')).rejects.toMatchObject({ statusCode: 501 })
            })

            it('returns 400 when server has no url', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer({ url: undefined }))
                await expect(mcpServersService.listMCPServerTools('s-1')).rejects.toMatchObject({ statusCode: 400 })
            })

            it('returns 503 when gateway is not configured', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                mockAppServer.mcpGateway = undefined
                await expect(mcpServersService.listMCPServerTools('s-1')).rejects.toMatchObject({ statusCode: 503 })
            })

            it('delegates to gateway.listLiveTools and returns the catalog', async () => {
                const server = baseServer()
                mockRepository.findOneBy.mockResolvedValue(server)
                const gatewayMock = {
                    listLiveTools: jest.fn().mockResolvedValue([{ name: 'query', description: 'sql', inputSchema: {} }])
                }
                mockAppServer.mcpGateway = gatewayMock
                const tools = await mcpServersService.listMCPServerTools('s-1')
                expect(gatewayMock.listLiveTools).toHaveBeenCalledWith(server)
                expect(tools).toEqual([{ name: 'query', description: 'sql', inputSchema: {} }])
                mockAppServer.mcpGateway = undefined
            })
        })

        // ─── testMCPServerConnection ───────────────────────────────────

        describe('testMCPServerConnection', () => {
            const baseServer = (overrides: any = {}) => ({
                id: 's-1',
                slug: 'postgres',
                transport: 'streamable-http',
                url: 'https://mcp.example.com',
                enabled: true,
                ...overrides
            })

            afterEach(() => {
                mockAppServer.mcpGateway = undefined
            })

            it('returns 404 when server not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)
                await expect(mcpServersService.testMCPServerConnection('missing')).rejects.toMatchObject({ statusCode: 404 })
            })

            it('returns 501 for stdio transport', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer({ transport: 'stdio' }))
                await expect(mcpServersService.testMCPServerConnection('s-1')).rejects.toMatchObject({ statusCode: 501 })
            })

            it('returns 400 when server has no url', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer({ url: undefined }))
                await expect(mcpServersService.testMCPServerConnection('s-1')).rejects.toMatchObject({ statusCode: 400 })
            })

            it('returns 503 when gateway is not configured', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                mockAppServer.mcpGateway = undefined
                await expect(mcpServersService.testMCPServerConnection('s-1')).rejects.toMatchObject({ statusCode: 503 })
            })

            it('returns success with tool count when gateway.listLiveTools resolves', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                mockAppServer.mcpGateway = {
                    listLiveTools: jest.fn().mockResolvedValue([{ name: 'query' }, { name: 'list_tables' }])
                }
                const result = await mcpServersService.testMCPServerConnection('s-1')
                expect(result.success).toBe(true)
                expect(result.statusCode).toBe(200)
                expect(result.toolCount).toBe(2)
                expect(result.message).toBe('Connected — 2 tools discovered')
                expect(typeof result.latencyMs).toBe('number')
            })

            it('uses singular form when exactly one tool is discovered', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                mockAppServer.mcpGateway = {
                    listLiveTools: jest.fn().mockResolvedValue([{ name: 'echo' }])
                }
                const result = await mcpServersService.testMCPServerConnection('s-1')
                expect(result.message).toBe('Connected — 1 tool discovered')
            })

            it('returns success=false with the gateway error message and 502 statusCode on probe failure', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                const { InternalChronosError } = require('../../src/errors/internalChronosError')
                const probeError = new InternalChronosError(502, 'Failed to list tools for MCP server postgres: rpc broken')
                mockAppServer.mcpGateway = {
                    listLiveTools: jest.fn().mockRejectedValue(probeError)
                }
                const result = await mcpServersService.testMCPServerConnection('s-1')
                expect(result.success).toBe(false)
                expect(result.statusCode).toBe(502)
                expect(result.message).toContain('rpc broken')
            })

            it('returns statusCode=null when probe error is not an InternalChronosError', async () => {
                mockRepository.findOneBy.mockResolvedValue(baseServer())
                mockAppServer.mcpGateway = {
                    listLiveTools: jest.fn().mockRejectedValue(new Error('socket hang up'))
                }
                const result = await mcpServersService.testMCPServerConnection('s-1')
                expect(result.success).toBe(false)
                expect(result.statusCode).toBeNull()
                expect(result.message).toContain('socket hang up')
            })
        })
    })
}
