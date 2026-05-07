/**
 * Test suite for the MCP Gateway (v1.6.0 — Group D).
 * Covers tool-name parsing, the `Agent.allowedTools ∩ MCPServer.allowedTools`
 * intersection, error mapping, pool reuse, idle reaper, and lifecycle.
 *
 * The MCP SDK Client/transport classes are mocked via jest.doMock so no real
 * MCP connection is opened — `client.request` is a jest.fn returning a fixed
 * result and we assert on the args.
 */
export function mcpGatewayServiceTest() {
    describe('MCP Gateway', () => {
        let MCPGateway: any
        let mockMCPServerRepo: any
        let mockClientInstance: any
        let mockClientCtor: jest.Mock
        let mockStreamableTransportCtor: jest.Mock
        let mockSSETransportCtor: jest.Mock
        let mockAppDataSource: any
        let mockAuditService: { recordToolInvocation: jest.Mock; listByCallId: jest.Mock }

        const baseAgent = (overrides: any = {}) => ({
            id: 'agent-1',
            slug: 'my-agent',
            allowedTools: JSON.stringify(['postgres.query', 'github.create_issue']),
            ...overrides
        })

        const baseServer = (overrides: any = {}) => ({
            id: 'srv-1',
            slug: 'postgres',
            transport: 'streamable-http',
            url: 'https://mcp.example.com',
            enabled: true,
            status: 'HEALTHY',
            allowedTools: JSON.stringify(['query', 'list_tables']),
            requestHeaders: undefined,
            outboundAuth: undefined,
            timeoutMs: 5000,
            ...overrides
        })

        const setupMocks = () => {
            jest.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
                Client: mockClientCtor
            }))
            jest.doMock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
                StreamableHTTPClientTransport: mockStreamableTransportCtor
            }))
            jest.doMock('@modelcontextprotocol/sdk/client/sse.js', () => ({
                SSEClientTransport: mockSSETransportCtor
            }))
            jest.doMock('@modelcontextprotocol/sdk/types.js', () => ({
                CallToolResultSchema: { __schema: 'CallToolResult' },
                ListToolsResultSchema: { __schema: 'ListToolsResult' }
            }))
            jest.doMock('../../src/services/agent-runtime-http', () => ({
                __esModule: true,
                default: {
                    resolveOutboundAuth: jest.fn().mockResolvedValue({})
                }
            }))
            jest.doMock('../../src/services/audit', () => ({
                __esModule: true,
                default: mockAuditService
            }))
        }

        beforeEach(() => {
            jest.resetModules()
            jest.useRealTimers()

            mockClientInstance = {
                connect: jest.fn().mockResolvedValue(undefined),
                close: jest.fn().mockResolvedValue(undefined),
                request: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
            }
            mockClientCtor = jest.fn().mockImplementation(() => mockClientInstance)
            mockStreamableTransportCtor = jest.fn().mockImplementation(() => ({}))
            mockSSETransportCtor = jest.fn().mockImplementation(() => ({}))

            mockMCPServerRepo = {
                findOneBy: jest.fn().mockResolvedValue(null)
            }
            mockAppDataSource = {
                getRepository: jest.fn(() => mockMCPServerRepo)
            }
            mockAuditService = {
                recordToolInvocation: jest.fn().mockResolvedValue(undefined),
                listByCallId: jest.fn().mockResolvedValue([])
            }

            setupMocks()
            MCPGateway = require('../../src/services/mcp-gateway').MCPGateway
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        // ─── tool name parsing ─────────────────────────────────────────

        describe('namespacing', () => {
            it.each([
                ['no-dot', 'no namespace'],
                ['.tool', 'empty slug'],
                ['slug.', 'empty tool'],
                ['', 'empty string']
            ])('rejects malformed tool name "%s" (%s)', async (name) => {
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent({ allowedTools: JSON.stringify([name]) }), name, {})).rejects.toMatchObject({
                    statusCode: 400
                })
            })

            it('accepts a tool name containing dots after the namespace', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ allowedTools: JSON.stringify(['namespaced.foo']) }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const agent = baseAgent({ allowedTools: JSON.stringify(['postgres.namespaced.foo']) })
                await gateway.invoke(agent, 'postgres.namespaced.foo', { x: 1 })
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'tools/call', params: { name: 'namespaced.foo', arguments: { x: 1 } } }),
                    expect.anything(),
                    expect.objectContaining({ timeout: 5000 })
                )
            })
        })

        // ─── server lookup / status gates ──────────────────────────────

        describe('server resolution', () => {
            it('returns 404 when server slug not registered', async () => {
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 404 })
            })

            it('returns 409 when server is disabled', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ enabled: false }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 409 })
            })

            it('returns 503 when server is unhealthy', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ status: 'UNHEALTHY' }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 503 })
            })

            it('returns 400 when server has no url configured', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ url: undefined }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 400 })
            })

            it('returns 501 for stdio transport', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ transport: 'stdio' }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 501 })
            })
        })

        // ─── intersection enforcement ──────────────────────────────────

        describe('allowedTools intersection', () => {
            it('returns 403 when agent does not list the namespaced tool', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const agent = baseAgent({ allowedTools: JSON.stringify(['github.create_issue']) })
                await expect(gateway.invoke(agent, 'postgres.query', {})).rejects.toMatchObject({ statusCode: 403 })
            })

            it('returns 403 when server does not expose the bare tool', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer({ allowedTools: JSON.stringify(['list_tables']) }))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 403 })
            })

            it('passes both intersections, calls tools/call, logs audit', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const result = await gateway.invoke(baseAgent(), 'postgres.query', { sql: 'select 1' }, { callId: 'c-1' })
                expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] })
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    { method: 'tools/call', params: { name: 'query', arguments: { sql: 'select 1' } } },
                    { __schema: 'CallToolResult' },
                    { timeout: 5000 }
                )
            })
        })

        // ─── pool reuse + error eviction ───────────────────────────────

        describe('connection pool', () => {
            it('reuses pooled client across invocations of the same server', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                expect(mockClientCtor).toHaveBeenCalledTimes(1)
                expect(mockClientInstance.connect).toHaveBeenCalledTimes(1)
                expect(mockClientInstance.request).toHaveBeenCalledTimes(2)
                expect(gateway.poolSize()).toBe(1)
            })

            it('evicts client and maps to 502 when tools/call rejects', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                mockClientInstance.request.mockRejectedValueOnce(new Error('upstream blew up'))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 502 })
                expect(gateway.poolSize()).toBe(0)
                expect(mockClientInstance.close).toHaveBeenCalled()
            })

            it('maps connect failure to 502 BAD_GATEWAY', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                mockClientInstance.connect.mockRejectedValueOnce(new Error('refused'))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {})).rejects.toMatchObject({ statusCode: 502 })
            })
        })

        // ─── idle reaper + lifecycle ───────────────────────────────────

        describe('lifecycle', () => {
            it('reaps clients past the idle timeout', async () => {
                process.env.MCP_CLIENT_IDLE_TIMEOUT_MS = '1000'
                jest.resetModules()
                setupMocks()
                MCPGateway = require('../../src/services/mcp-gateway').MCPGateway

                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })

                jest.useFakeTimers()
                gateway.start()
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                expect(gateway.poolSize()).toBe(1)

                // Advance past the idle window AND the reaper interval (60s).
                jest.advanceTimersByTime(120000)
                expect(gateway.poolSize()).toBe(0)
                expect(mockClientInstance.close).toHaveBeenCalled()

                jest.useRealTimers()
                await gateway.stop()
                delete process.env.MCP_CLIENT_IDLE_TIMEOUT_MS
            })

            it('stop() clears pool and closes pooled clients', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                gateway.start()
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                await gateway.stop()
                expect(gateway.poolSize()).toBe(0)
                expect(mockClientInstance.close).toHaveBeenCalled()
            })
        })

        // ─── audit persistence (v1.7 § 3a) ─────────────────────────────

        describe('audit persistence', () => {
            it('records a successful invocation with success=true and the resolved server fields', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const agent = baseAgent({ id: 'agent-7', userId: 'user-7' })
                await gateway.invoke(agent, 'postgres.query', { x: 1 }, { callId: 'call-abc' })
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalledTimes(1)
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentId: 'agent-7',
                        agentSlug: 'my-agent',
                        mcpServerId: 'srv-1',
                        mcpServerSlug: 'postgres',
                        toolName: 'query',
                        namespacedTool: 'postgres.query',
                        success: true,
                        errorMessage: null,
                        callId: 'call-abc',
                        userId: 'user-7'
                    })
                )
            })

            it('records a failed invocation with success=false and the operator-friendly errorMessage', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                mockClientInstance.request.mockRejectedValueOnce(new Error('upstream broke'))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.invoke(baseAgent(), 'postgres.query', {}, { callId: 'call-fail' })).rejects.toMatchObject({
                    statusCode: 502
                })
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalledTimes(1)
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        errorMessage: 'upstream broke',
                        callId: 'call-fail'
                    })
                )
            })

            it('uses fire-and-forget so a slow audit write cannot block invoke completion', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                // Hold the audit promise pending until after invoke resolves — proves the
                // gateway is NOT awaiting it. The audit service's own contract (verified in
                // its unit tests) guarantees no-throw on real DB errors; here we only need
                // to prove the hot path doesn't await.
                let releaseAudit: () => void = () => {}
                mockAuditService.recordToolInvocation.mockImplementation(
                    () =>
                        new Promise<void>((resolve) => {
                            releaseAudit = resolve
                        })
                )
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const invokePromise = gateway.invoke(baseAgent(), 'postgres.query', {}, { callId: 'call-async' })
                await expect(invokePromise).resolves.toBeDefined()
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalled()
                releaseAudit() // tidy
            })

            it('passes null callId through when the caller does not provide one', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                expect(mockAuditService.recordToolInvocation).toHaveBeenCalledWith(expect.objectContaining({ callId: null }))
            })
        })

        // ─── listLiveTools ─────────────────────────────────────────────

        describe('listLiveTools', () => {
            it('opens a pooled client, calls tools/list, and maps the catalog', async () => {
                mockClientInstance.request.mockResolvedValueOnce({
                    tools: [
                        { name: 'query', description: 'run sql', inputSchema: { type: 'object' } },
                        { name: 'list_tables', description: undefined, inputSchema: { type: 'object' } }
                    ]
                })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const tools = await gateway.listLiveTools(baseServer())
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    { method: 'tools/list', params: {} },
                    { __schema: 'ListToolsResult' },
                    { timeout: 5000 }
                )
                expect(tools).toEqual([
                    { name: 'query', description: 'run sql', inputSchema: { type: 'object' } },
                    { name: 'list_tables', description: undefined, inputSchema: { type: 'object' } }
                ])
            })

            it('reuses a pooled client across listLiveTools and invoke', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                mockClientInstance.request.mockResolvedValueOnce({ tools: [{ name: 'query' }] })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.listLiveTools(baseServer())
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                expect(mockClientCtor).toHaveBeenCalledTimes(1)
                expect(mockClientInstance.connect).toHaveBeenCalledTimes(1)
            })

            it('maps tools/list error to 502 and evicts the pooled client', async () => {
                mockClientInstance.request.mockRejectedValueOnce(new Error('rpc broken'))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.listLiveTools(baseServer())).rejects.toMatchObject({ statusCode: 502 })
                expect(gateway.poolSize()).toBe(0)
                expect(mockClientInstance.close).toHaveBeenCalled()
            })

            it('returns an empty array when the server reports no tools field', async () => {
                mockClientInstance.request.mockResolvedValueOnce({})
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const tools = await gateway.listLiveTools(baseServer())
                expect(tools).toEqual([])
            })
        })

        // ─── healthCheck ───────────────────────────────────────────────

        describe('healthCheck', () => {
            const ORIGINAL_ENV = process.env.MCP_SERVER_HEALTH_TIMEOUT_MS
            afterEach(() => {
                if (ORIGINAL_ENV === undefined) delete process.env.MCP_SERVER_HEALTH_TIMEOUT_MS
                else process.env.MCP_SERVER_HEALTH_TIMEOUT_MS = ORIGINAL_ENV
            })

            it('opens a pooled client, calls tools/list, and resolves on success', async () => {
                mockClientInstance.request.mockResolvedValueOnce({ tools: [{ name: 'query' }] })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.healthCheck(baseServer())).resolves.toBeUndefined()
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    { method: 'tools/list', params: {} },
                    { __schema: 'ListToolsResult' },
                    expect.objectContaining({ timeout: expect.any(Number) })
                )
                expect(gateway.poolSize()).toBe(1)
            })

            it('throws and evicts the pooled client when tools/list fails', async () => {
                mockClientInstance.request.mockRejectedValueOnce(new Error('rpc broken'))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.healthCheck(baseServer())).rejects.toThrow('rpc broken')
                expect(gateway.poolSize()).toBe(0)
                expect(mockClientInstance.close).toHaveBeenCalled()
            })

            it('reuses the pooled client across healthCheck and invoke', async () => {
                mockMCPServerRepo.findOneBy.mockResolvedValue(baseServer())
                mockClientInstance.request.mockResolvedValueOnce({ tools: [{ name: 'query' }] })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.healthCheck(baseServer())
                await gateway.invoke(baseAgent(), 'postgres.query', {})
                expect(mockClientCtor).toHaveBeenCalledTimes(1)
                expect(mockClientInstance.connect).toHaveBeenCalledTimes(1)
            })

            it('clamps timeout to MCP_SERVER_HEALTH_TIMEOUT_MS even when server.timeoutMs is larger', async () => {
                process.env.MCP_SERVER_HEALTH_TIMEOUT_MS = '2000'
                mockClientInstance.request.mockResolvedValueOnce({ tools: [] })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.healthCheck(baseServer({ timeoutMs: 30000 }))
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    { method: 'tools/list', params: {} },
                    { __schema: 'ListToolsResult' },
                    { timeout: 2000 }
                )
            })

            it('uses server.timeoutMs when smaller than the env cap', async () => {
                process.env.MCP_SERVER_HEALTH_TIMEOUT_MS = '5000'
                mockClientInstance.request.mockResolvedValueOnce({ tools: [] })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await gateway.healthCheck(baseServer({ timeoutMs: 1000 }))
                expect(mockClientInstance.request).toHaveBeenCalledWith(
                    { method: 'tools/list', params: {} },
                    { __schema: 'ListToolsResult' },
                    { timeout: 1000 }
                )
            })

            it('rejects with timeout message when probe exceeds the timeout budget', async () => {
                process.env.MCP_SERVER_HEALTH_TIMEOUT_MS = '50'
                mockClientInstance.request.mockImplementation(() => new Promise(() => {}))
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                await expect(gateway.healthCheck(baseServer({ timeoutMs: 30000 }))).rejects.toThrow(/timed out after 50ms/)
            })
        })

        // ─── listAllowedTools ──────────────────────────────────────────

        describe('listAllowedTools', () => {
            it('returns [] when agent has no allowedTools', async () => {
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const tools = await gateway.listAllowedTools(baseAgent({ allowedTools: undefined }))
                expect(tools).toEqual([])
            })

            it('filters by enabled servers and the bare-tool intersection', async () => {
                mockMCPServerRepo.findOneBy.mockImplementation(({ slug }: any) => {
                    if (slug === 'postgres') return Promise.resolve(baseServer({ allowedTools: JSON.stringify(['query']) }))
                    if (slug === 'github')
                        return Promise.resolve(
                            baseServer({ id: 'srv-2', slug: 'github', enabled: false, allowedTools: JSON.stringify(['create_issue']) })
                        )
                    return Promise.resolve(null)
                })
                const gateway = new MCPGateway({ appDataSource: mockAppDataSource })
                const agent = baseAgent({
                    allowedTools: JSON.stringify(['postgres.query', 'postgres.list_tables', 'github.create_issue', 'unknown.foo'])
                })
                const tools = await gateway.listAllowedTools(agent)
                expect(tools).toEqual([{ name: 'postgres.query', server: 'postgres', tool: 'query' }])
            })
        })
    })
}
