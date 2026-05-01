import { AgentHealthPoller } from '../../src/schedulers/AgentHealthPoller'
import { Agent } from '../../src/database/entities/Agent'

function mockAgent(overrides: Partial<Agent> = {}): Agent {
    return {
        id: 'a1',
        name: 'Test',
        slug: 'test',
        version: '1.0.0',
        runtimeType: 'HTTP' as any,
        status: 'UNKNOWN' as any,
        enabled: true,
        serviceEndpoint: 'https://example.com',
        runtimeConfig: '{"healthEndpoint":"https://example.com/health"}',
        lastHealthCheckAt: undefined,
        lastHealthError: undefined,
        createdDate: new Date(),
        updatedDate: new Date(),
        ...overrides
    } as Agent
}

/**
 * Test suite for AgentHealthPoller (v1.6.0).
 * Verifies the poll cycle, atomic-claim behaviour, state-transition writes
 * (HEALTHY ↔ UNHEALTHY), and the no-overlap guard.
 */
export function agentHealthPollerTest() {
    describe('AgentHealthPoller', () => {
        let mockDataSource: any
        let mockAgentRepo: any
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
            mockAgentRepo = {
                update: jest.fn().mockResolvedValue({ affected: 1 }),
                createQueryBuilder: jest.fn((alias?: string) => (alias ? mockQueryBuilder : mockUpdateQB))
            }
            mockDataSource = {
                getRepository: jest.fn().mockReturnValue(mockAgentRepo)
            }
        })

        afterEach(() => {
            global.fetch = originalFetch
        })

        const createPoller = () => new AgentHealthPoller({ appDataSource: mockDataSource })

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
            it('queries only HTTP, enabled, non-DISABLED agents', async () => {
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockAgentRepo.createQueryBuilder).toHaveBeenCalledWith('agent')
                expect(mockQueryBuilder.where).toHaveBeenCalledWith('agent.runtimeType = :runtimeType', { runtimeType: 'HTTP' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('agent.enabled = :enabled', { enabled: true })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('agent.status <> :status', { status: 'DISABLED' })
            })

            it('does not overlap polls', async () => {
                const poller = createPoller()
                ;(poller as any).running = true
                await (poller as any).poll()
                expect(mockAgentRepo.createQueryBuilder).not.toHaveBeenCalled()
            })

            it('resets running flag even on error', async () => {
                mockAgentRepo.createQueryBuilder.mockImplementationOnce(() => {
                    throw new Error('boom')
                })
                const poller = createPoller()
                await (poller as any).poll()
                expect((poller as any).running).toBe(false)
            })
        })

        // ─── checkAgentHealth ──────────────────────────────────────────

        describe('checkAgentHealth', () => {
            it('marks HEALTHY when health endpoint returns 2xx and clears lastHealthError', async () => {
                global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockAgent()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockAgentRepo.update).toHaveBeenCalledWith(
                    'a1',
                    expect.objectContaining({ status: 'HEALTHY', lastHealthError: null })
                )
            })

            it('marks UNHEALTHY with HTTP status message when health endpoint returns non-2xx', async () => {
                global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockAgent()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockAgentRepo.update).toHaveBeenCalledWith(
                    'a1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('HTTP 503')
                    })
                )
            })

            it('marks UNHEALTHY with timeout message on AbortError', async () => {
                const abort = Object.assign(new Error('abort'), { name: 'AbortError' })
                global.fetch = jest.fn().mockRejectedValue(abort) as any
                mockQueryBuilder.getMany.mockResolvedValue([mockAgent()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockAgentRepo.update).toHaveBeenCalledWith(
                    'a1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('timed out')
                    })
                )
            })

            it('marks UNHEALTHY when no url is configured', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([mockAgent({ serviceEndpoint: undefined, runtimeConfig: '{}' })])
                const poller = createPoller()
                await (poller as any).poll()
                expect(mockAgentRepo.update).toHaveBeenCalledWith(
                    'a1',
                    expect.objectContaining({
                        status: 'UNHEALTHY',
                        lastHealthError: expect.stringContaining('No healthEndpoint')
                    })
                )
            })

            it('skips fetch and update when atomic claim returns 0 affected', async () => {
                mockUpdateQB.execute.mockResolvedValue({ affected: 0 })
                global.fetch = jest.fn() as any
                mockQueryBuilder.getMany.mockResolvedValue([mockAgent()])
                const poller = createPoller()
                await (poller as any).poll()
                expect(global.fetch).not.toHaveBeenCalled()
                expect(mockAgentRepo.update).not.toHaveBeenCalled()
            })
        })
    })
}
