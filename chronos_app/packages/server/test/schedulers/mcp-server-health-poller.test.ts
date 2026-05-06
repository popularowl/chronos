import { MCPServerHealthPoller } from '../../src/schedulers/MCPServerHealthPoller'
import { MCPServer } from '../../src/database/entities/MCPServer'

function mockServer(overrides: Partial<MCPServer> = {}): MCPServer {
    return {
        id: 's1',
        name: 'Test MCP',
        slug: 'test-mcp',
        transport: 'streamable-http' as any,
        url: 'https://mcp.example.com',
        status: 'UNKNOWN' as any,
        enabled: true,
        timeoutMs: 30000,
        lastHealthCheckAt: undefined,
        lastHealthError: undefined,
        createdDate: new Date(),
        updatedDate: new Date(),
        ...overrides
    } as MCPServer
}

/**
 * Test suite for MCPServerHealthPoller.
 * Verifies the poll cycle, transport filter (stdio excluded), atomic-claim
 * behaviour, state-transition writes, and the no-overlap guard. Gateway
 * health probe is stubbed — see mcp-gateway.service.test for the real
 * `tools/list` round-trip behaviour.
 */
export function mcpServerHealthPollerTest() {
    describe('MCPServerHealthPoller', () => {
        let mockDataSource: any
        let mockServerRepo: any
        let mockQueryBuilder: any
        let mockUpdateQB: any
        let mockGateway: any

        beforeEach(() => {
            jest.clearAllMocks()

            mockUpdateQB = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 1 })
            }
            mockQueryBuilder = {
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([])
            }
            mockServerRepo = {
                update: jest.fn().mockResolvedValue({ affected: 1 }),
                createQueryBuilder: jest.fn((alias?: string) => (alias ? mockQueryBuilder : mockUpdateQB))
            }
            mockDataSource = {
                getRepository: jest.fn().mockReturnValue(mockServerRepo)
            }
            mockGateway = {
                healthCheck: jest.fn().mockResolvedValue(undefined)
            }
        })

        const createPoller = () => new MCPServerHealthPoller({ appDataSource: mockDataSource, mcpGateway: mockGateway })

        // ─── start/stop ────────────────────────────────────────────────

        describe('start/stop', () => {
            it('starts and stops without errors', () => {
                const poller = createPoller()
                poller.start()
                expect((poller as any).intervalId).not.toBeNull()
                poller.stop()
                expect((poller as any).intervalId).toBeNull()
            })

            it('does not start twice', () => {
                const poller = createPoller()
                poller.start()
                const first = (poller as any).intervalId
                poller.start()
                expect((poller as any).intervalId).toBe(first)
                poller.stop()
            })
        })

        // ─── poll ──────────────────────────────────────────────────────

        describe('poll', () => {
            it('queries only enabled, non-DISABLED servers with streamable-http or sse transport', async () => {
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.createQueryBuilder).toHaveBeenCalledWith('mcp_server')
                expect(mockQueryBuilder.where).toHaveBeenCalledWith('mcp_server.enabled = :enabled', { enabled: true })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mcp_server.status <> :status', { status: 'DISABLED' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mcp_server.transport IN (:...transports)', {
                    transports: ['streamable-http', 'sse']
                })
            })

            it('does not overlap polls', async () => {
                const poller = createPoller()
                ;(poller as any).running = true
                await (poller as any).poll()
                expect(mockServerRepo.createQueryBuilder).not.toHaveBeenCalled()
            })

            it('resets running flag even on error', async () => {
                mockServerRepo.createQueryBuilder.mockImplementationOnce(() => {
                    throw new Error('boom')
                })
                const poller = createPoller()
                await (poller as any).poll()
                expect((poller as any).running).toBe(false)
            })
        })

        // ─── checkServerHealth ─────────────────────────────────────────

        describe('checkServerHealth', () => {
            it('marks HEALTHY when gateway.healthCheck resolves and clears lastHealthError', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockGateway.healthCheck).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({ status: 'HEALTHY', lastHealthError: null })
                )
            })

            it('marks UNHEALTHY with prefixed message when gateway.healthCheck throws', async () => {
                mockGateway.healthCheck.mockRejectedValue(new Error('rpc broken'))
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('Health check failed: rpc broken')
                    })
                )
            })

            it('marks UNHEALTHY with the timeout message verbatim (no "Health check failed:" prefix)', async () => {
                mockGateway.healthCheck.mockRejectedValue(new Error('Health check timed out after 5000ms'))
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: 'Health check timed out after 5000ms'
                    })
                )
            })

            it('marks UNHEALTHY when no url is configured (without invoking the gateway)', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([mockServer({ url: undefined })])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockGateway.healthCheck).not.toHaveBeenCalled()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({ status: 'UNHEALTHY', lastHealthError: 'No url configured' })
                )
            })

            it('skips gateway call and update when atomic claim returns 0 affected', async () => {
                mockUpdateQB.execute.mockResolvedValue({ affected: 0 })
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockGateway.healthCheck).not.toHaveBeenCalled()
                expect(mockServerRepo.update).not.toHaveBeenCalled()
            })
        })
    })
}
