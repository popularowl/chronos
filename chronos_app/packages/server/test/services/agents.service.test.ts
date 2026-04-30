import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for Agents service (v1.6.0).
 * Covers CRUD, validation (URL/SSRF, runtime-specific required fields),
 * slug uniqueness, callback-token rotation, and the ENABLE_AGENTS gate.
 */
export function agentsServiceTest() {
    describe('Agents Service', () => {
        let agentsService: any
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
            process.env.ENABLE_AGENTS = 'true'
            delete process.env.ALLOW_LOOPBACK_AGENTS

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: { getRepository: jest.fn().mockReturnValue(mockRepository) }
            }

            setupMocks()
            agentsService = require('../../src/services/agents').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            // Default: slug uniqueness check returns nothing.
            mockRepository.findOneBy.mockResolvedValue(null)
        })

        // ─── feature flag ──────────────────────────────────────────────

        describe('ENABLE_AGENTS gate', () => {
            it('blocks createAgent when disabled', async () => {
                const original = process.env.ENABLE_AGENTS
                process.env.ENABLE_AGENTS = 'false'
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                const disabled = require('../../src/services/agents').default
                await expect(
                    disabled.createAgent({
                        name: 'x',
                        runtimeType: 'HTTP',
                        serviceEndpoint: 'https://example.com'
                    })
                ).rejects.toMatchObject({ statusCode: 503 })
                process.env.ENABLE_AGENTS = original
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                agentsService = require('../../src/services/agents').default
            })
        })

        // ─── createAgent ───────────────────────────────────────────────

        describe('createAgent', () => {
            it('creates an HTTP agent with default timeout, callback token and HEALTHY=UNKNOWN status', async () => {
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 'agent-1', ...entity }))

                const result = await agentsService.createAgent({
                    name: 'My HTTP Agent',
                    runtimeType: 'HTTP',
                    serviceEndpoint: 'https://example.com',
                    runtimeConfig: { healthEndpoint: 'https://example.com/health' }
                })

                expect(result.id).toBe('agent-1')
                expect(result.runtimeType).toBe('HTTP')
                expect(result.status).toBe('UNKNOWN')
                expect(result.callbackToken).toBeDefined()
                expect(typeof result.callbackToken).toBe('string')
                expect(result.callbackToken.length).toBe(64)
                const cfg = JSON.parse(result.runtimeConfig)
                expect(cfg.timeoutMs).toBe(60000)
            })

            it('rejects HTTP agent without serviceEndpoint', async () => {
                await expect(agentsService.createAgent({ name: 'x', runtimeType: 'HTTP' })).rejects.toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('serviceEndpoint')
                })
            })

            it('rejects URL with non-http(s) protocol', async () => {
                await expect(
                    agentsService.createAgent({ name: 'x', runtimeType: 'HTTP', serviceEndpoint: 'ftp://example.com' })
                ).rejects.toMatchObject({ statusCode: 400 })
            })

            it('rejects loopback URL by default (SSRF guard)', async () => {
                await expect(
                    agentsService.createAgent({ name: 'x', runtimeType: 'HTTP', serviceEndpoint: 'http://127.0.0.1:8080' })
                ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('loopback') })
            })

            it('rejects RFC1918 / private IP', async () => {
                await expect(
                    agentsService.createAgent({ name: 'x', runtimeType: 'HTTP', serviceEndpoint: 'http://10.0.0.5' })
                ).rejects.toMatchObject({ statusCode: 400 })
                await expect(
                    agentsService.createAgent({ name: 'x', runtimeType: 'HTTP', serviceEndpoint: 'http://192.168.1.1' })
                ).rejects.toMatchObject({ statusCode: 400 })
                await expect(
                    agentsService.createAgent({ name: 'x', runtimeType: 'HTTP', serviceEndpoint: 'http://172.20.0.1' })
                ).rejects.toMatchObject({ statusCode: 400 })
            })

            it('allows loopback when ALLOW_LOOPBACK_AGENTS=true', async () => {
                process.env.ALLOW_LOOPBACK_AGENTS = 'true'
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                const allowed = require('../../src/services/agents').default
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 'a', ...entity }))
                const result = await allowed.createAgent({
                    name: 'local',
                    runtimeType: 'HTTP',
                    serviceEndpoint: 'http://localhost:8080'
                })
                expect(result.serviceEndpoint).toBe('http://localhost:8080')
                delete process.env.ALLOW_LOOPBACK_AGENTS
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                agentsService = require('../../src/services/agents').default
            })

            it('rejects BUILT_IN agent without builtinAgentflowId', async () => {
                await expect(agentsService.createAgent({ name: 'x', runtimeType: 'BUILT_IN' })).rejects.toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('builtinAgentflowId')
                })
            })

            it('rejects BUILT_IN agent when underlying agentflow does not exist', async () => {
                // First findOneBy for slug uniqueness returns null;
                // second findOneBy for AgentFlow check returns null too.
                mockRepository.findOneBy.mockResolvedValue(null)
                await expect(
                    agentsService.createAgent({
                        name: 'x',
                        runtimeType: 'BUILT_IN',
                        builtinAgentflowId: '00000000-0000-0000-0000-000000000000'
                    })
                ).rejects.toMatchObject({ statusCode: 404 })
            })

            it('does not generate callback token for BUILT_IN agents', async () => {
                mockRepository.findOneBy.mockImplementation(({ id }: any) => {
                    if (id === 'flow-1') return Promise.resolve({ id: 'flow-1', name: 'flow' })
                    return Promise.resolve(null)
                })
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 'agent-1', ...entity }))
                const result = await agentsService.createAgent({
                    name: 'BI',
                    runtimeType: 'BUILT_IN',
                    builtinAgentflowId: 'flow-1'
                })
                expect(result.callbackToken).toBeUndefined()
            })

            it('serialises capabilities/skills/etc as JSON strings', async () => {
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 'a', ...entity }))
                const result = await agentsService.createAgent({
                    name: 'rich',
                    runtimeType: 'HTTP',
                    serviceEndpoint: 'https://example.com',
                    capabilities: { streaming: true, pushNotifications: false },
                    skills: [{ id: 'classify', name: 'classify' }]
                })
                expect(typeof result.capabilities).toBe('string')
                expect(JSON.parse(result.capabilities).streaming).toBe(true)
                expect(typeof result.skills).toBe('string')
                expect(JSON.parse(result.skills)[0].id).toBe('classify')
            })

            it('appends -1 suffix on slug collision', async () => {
                let calls = 0
                mockRepository.findOneBy.mockImplementation(({ slug }: any) => {
                    if (!slug) return Promise.resolve(null)
                    calls++
                    if (calls === 1) return Promise.resolve({ id: 'taken' })
                    return Promise.resolve(null)
                })
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 'a', ...entity }))
                const result = await agentsService.createAgent({
                    name: 'collide',
                    slug: 'collide',
                    runtimeType: 'HTTP',
                    serviceEndpoint: 'https://example.com'
                })
                expect(result.slug).toBe('collide-1')
            })
        })

        // ─── regenerateCallbackToken ───────────────────────────────────

        describe('regenerateCallbackToken', () => {
            it('rotates the token for HTTP agents', async () => {
                const stored = { id: 'a1', runtimeType: 'HTTP', callbackToken: 'old' }
                mockRepository.findOneBy.mockResolvedValue(stored)
                mockRepository.save.mockImplementation((e: any) => Promise.resolve(e))
                const result = await agentsService.regenerateCallbackToken('a1')
                expect(result.callbackToken).not.toBe('old')
                expect(result.callbackToken.length).toBe(64)
            })

            it('rejects for BUILT_IN agents', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 'a1', runtimeType: 'BUILT_IN' })
                await expect(agentsService.regenerateCallbackToken('a1')).rejects.toMatchObject({ statusCode: 400 })
            })

            it('returns 404 when agent not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)
                await expect(agentsService.regenerateCallbackToken('missing')).rejects.toMatchObject({ statusCode: 404 })
            })
        })

        // ─── toggleAgent ───────────────────────────────────────────────

        describe('toggleAgent', () => {
            it('disables and sets status=DISABLED', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 'a1', enabled: true, status: 'HEALTHY' })
                mockRepository.save.mockImplementation((e: any) => Promise.resolve(e))
                const result = await agentsService.toggleAgent('a1', false)
                expect(result.enabled).toBe(false)
                expect(result.status).toBe('DISABLED')
            })

            it('re-enables a previously DISABLED agent and resets to UNKNOWN', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 'a1', enabled: false, status: 'DISABLED' })
                mockRepository.save.mockImplementation((e: any) => Promise.resolve(e))
                const result = await agentsService.toggleAgent('a1', true)
                expect(result.enabled).toBe(true)
                expect(result.status).toBe('UNKNOWN')
            })
        })

        // ─── getAllAgents filters ──────────────────────────────────────

        describe('getAllAgents', () => {
            it('applies runtimeType and status filters', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])
                await agentsService.getAllAgents(-1, -1, { runtimeType: 'HTTP', status: 'HEALTHY' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('agent.runtimeType = :runtimeType', { runtimeType: 'HTTP' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('agent.status = :status', { status: 'HEALTHY' })
            })

            it('returns paginated payload when page+limit provided', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: 'a' }], 1])
                const result = await agentsService.getAllAgents(1, 10)
                expect(result).toEqual({ data: [{ id: 'a' }], total: 1 })
            })

            it('returns array when no pagination', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: 'a' }], 1])
                const result = await agentsService.getAllAgents()
                expect(result).toEqual([{ id: 'a' }])
            })
        })
    })
}
