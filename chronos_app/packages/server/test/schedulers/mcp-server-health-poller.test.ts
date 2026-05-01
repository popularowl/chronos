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
 * Test suite for MCPServerHealthPoller (v1.6.0).
 * Verifies the poll cycle, transport filter (stdio excluded), atomic-claim
 * behaviour, state-transition writes, and the no-overlap guard.
 */
export function mcpServerHealthPollerTest() {
    describe('MCPServerHealthPoller', () => {
        let mockDataSource: any
        let mockServerRepo: any
        let mockQueryBuilder: any
        let mockUpdateQB: any
        let originalFetch: any

        beforeEach(() => {
            jest.clearAllMocks()
            originalFetch = global.fetch

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
        })

        afterEach(() => {
            global.fetch = originalFetch
        })

        const createPoller = () => new MCPServerHealthPoller({ appDataSource: mockDataSource })

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
            it('marks HEALTHY when GET returns 2xx and clears lastHealthError', async () => {
                global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({ status: 'HEALTHY', lastHealthError: null })
                )
            })

            it('marks UNHEALTHY with HTTP status message when GET returns non-2xx', async () => {
                global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('HTTP 502')
                    })
                )
            })

            it('marks UNHEALTHY with timeout message on AbortError', async () => {
                const abort = Object.assign(new Error('abort'), { name: 'AbortError' })
                global.fetch = jest.fn().mockRejectedValue(abort) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('timed out')
                    })
                )
            })

            it('marks UNHEALTHY when no url is configured', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([mockServer({ url: undefined })])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockServerRepo.update).toHaveBeenCalledWith(
                    's1',
                    expect.objectContaining({ status: 'UNHEALTHY', lastHealthError: 'No url configured' })
                )
            })

            it('skips fetch and update when atomic claim returns 0 affected', async () => {
                mockUpdateQB.execute.mockResolvedValue({ affected: 0 })
                global.fetch = jest.fn() as any
                mockQueryBuilder.getMany.mockResolvedValue([mockServer()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(global.fetch).not.toHaveBeenCalled()
                expect(mockServerRepo.update).not.toHaveBeenCalled()
            })
        })
    })
}
