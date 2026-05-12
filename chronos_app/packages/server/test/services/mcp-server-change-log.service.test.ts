import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'
import { MCPServerChangeKind } from '../../src/Interface'

/**
 * Test suite for v1.8.0 Group A — MCP server change-log service.
 * Covers diff + redaction logic, fire-and-forget contract, and the
 * paginated read API surfaced on the MCPServerDetail History tab.
 */
export function mcpServerChangeLogServiceTest() {
    describe('MCP Server Change Log Service', () => {
        let changeLogService: any
        let snapshotMCPServer: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
        }

        beforeEach(() => {
            jest.resetModules()
            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockAppServer = {
                AppDataSource: { getRepository: jest.fn().mockReturnValue(mockRepository) }
            }
            setupMocks()
            const mod = require('../../src/services/mcp-server-change-log')
            changeLogService = mod.default
            snapshotMCPServer = mod.snapshotMCPServer
        })

        afterAll(() => {
            jest.resetModules()
        })

        const actor = { userId: 'user-1', userEmail: 'user@example.com' }

        // ─── snapshotMCPServer ──────────────────────────────────────

        describe('snapshotMCPServer', () => {
            it('keeps only the tracked persistent fields', () => {
                const snap = snapshotMCPServer({
                    id: 'srv-1',
                    name: 'PG',
                    slug: 'pg',
                    transport: 'streamable-http',
                    url: 'https://pg.example',
                    enabled: true,
                    policies: '{}',
                    status: 'HEALTHY',
                    lastHealthCheckAt: new Date(),
                    createdDate: new Date(),
                    updatedDate: new Date(),
                    userId: 'creator-1'
                })
                expect(Object.keys(snap).sort()).toEqual(['enabled', 'name', 'policies', 'slug', 'transport', 'url'])
            })
        })

        // ─── recordCreate ───────────────────────────────────────────

        describe('recordCreate', () => {
            it('writes a CREATED row with the snapshot rolled into the diff', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-1' }] } as any)
                await changeLogService.recordCreate({
                    mcpServerId: 'srv-1',
                    snapshot: { name: 'PG', slug: 'pg', enabled: true },
                    actor
                })
                expect(mockRepository.insert).toHaveBeenCalledTimes(1)
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeKind).toBe(MCPServerChangeKind.CREATED)
                expect(row.userId).toBe('user-1')
                expect(row.userEmail).toBe('user@example.com')
                expect(JSON.parse(row.changedFields)).toEqual({
                    name: { before: null, after: 'PG' },
                    slug: { before: null, after: 'pg' },
                    enabled: { before: null, after: true }
                })
                expect(row.changeSummary).toContain('PG')
            })

            it('does not throw when the DB insert fails (fire-and-forget contract)', async () => {
                mockRepository.insert.mockRejectedValue(new Error('connection lost'))
                await expect(
                    changeLogService.recordCreate({
                        mcpServerId: 'srv-1',
                        snapshot: { name: 'PG' },
                        actor
                    })
                ).resolves.toBeUndefined()
            })
        })

        // ─── recordUpdate ───────────────────────────────────────────

        describe('recordUpdate', () => {
            it('writes a UPDATED row with the diff', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-2' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { name: 'PG', timeoutMs: 30000 },
                    after: { name: 'PG', timeoutMs: 60000 },
                    actor
                })
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeKind).toBe(MCPServerChangeKind.UPDATED)
                expect(JSON.parse(row.changedFields)).toEqual({
                    timeoutMs: { before: 30000, after: 60000 }
                })
                expect(row.changeSummary).toContain('timeoutMs')
            })

            it('redacts outboundAuth.bearerToken values to ***', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-3' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { 'outboundAuth.bearerToken': 'old-secret' },
                    after: { 'outboundAuth.bearerToken': 'new-secret' },
                    actor
                })
                const row = mockRepository.insert.mock.calls[0][0]
                const diff = JSON.parse(row.changedFields)
                expect(diff['outboundAuth.bearerToken']).toEqual({ before: '***', after: '***' })
            })

            it('redacts requestHeaders values to ***', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-4' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { requestHeaders: JSON.stringify({ 'X-API': 'old' }) },
                    after: { requestHeaders: JSON.stringify({ 'X-API': 'new' }) },
                    actor
                })
                const row = mockRepository.insert.mock.calls[0][0]
                const diff = JSON.parse(row.changedFields)
                expect(diff.requestHeaders).toEqual({ before: '***', after: '***' })
            })

            it('does not write when nothing actually changed', async () => {
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { name: 'PG', timeoutMs: 30000 },
                    after: { name: 'PG', timeoutMs: 30000 },
                    actor
                })
                expect(mockRepository.insert).not.toHaveBeenCalled()
            })

            it('writes ENABLED discriminator when kindOverride is ENABLED', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-5' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { enabled: false },
                    after: { enabled: true },
                    actor,
                    kindOverride: MCPServerChangeKind.ENABLED
                })
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeKind).toBe(MCPServerChangeKind.ENABLED)
                expect(row.changeSummary).toBe('Enabled server')
                expect(row.changedFields).toBeNull()
            })

            it('writes DISABLED discriminator when kindOverride is DISABLED', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-6' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { enabled: true },
                    after: { enabled: false },
                    actor,
                    kindOverride: MCPServerChangeKind.DISABLED
                })
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeKind).toBe(MCPServerChangeKind.DISABLED)
                expect(row.changeSummary).toBe('Disabled server')
            })

            it('diffs JSON-blob columns like policies by content', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-7' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { policies: JSON.stringify({ retry: { maxAttempts: 3 } }) },
                    after: { policies: JSON.stringify({ retry: { maxAttempts: 5 } }) },
                    actor
                })
                expect(mockRepository.insert).toHaveBeenCalledTimes(1)
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeSummary).toContain('policies')
            })

            it('summarises multi-field updates with a count', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-8' }] } as any)
                await changeLogService.recordUpdate({
                    mcpServerId: 'srv-1',
                    before: { name: 'A', timeoutMs: 1000, url: 'https://a.example' },
                    after: { name: 'B', timeoutMs: 2000, url: 'https://b.example' },
                    actor
                })
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeSummary).toMatch(/Updated url and 2 other fields/)
            })
        })

        // ─── recordDelete ───────────────────────────────────────────

        describe('recordDelete', () => {
            it('writes a DELETED row with the final snapshot summary', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'log-9' }] } as any)
                await changeLogService.recordDelete({
                    mcpServerId: 'srv-1',
                    snapshot: { name: 'PG' },
                    actor
                })
                const row = mockRepository.insert.mock.calls[0][0]
                expect(row.changeKind).toBe(MCPServerChangeKind.DELETED)
                expect(row.changeSummary).toContain('PG')
                expect(row.changedFields).toBeNull()
            })
        })

        // ─── listForServer ──────────────────────────────────────────

        describe('listForServer', () => {
            it('returns rows newest-first when no pagination is requested', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([{ id: 'log-1' }, { id: 'log-2' }])
                const result = await changeLogService.listForServer('srv-1')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('log.createdDate', 'DESC')
                expect(result).toEqual([{ id: 'log-1' }, { id: 'log-2' }])
            })

            it('returns paginated { data, total } when page+limit are positive', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: 'log-1' }], 42])
                const result = await changeLogService.listForServer('srv-1', { page: 2, limit: 10 })
                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(10)
                expect(result).toEqual({ data: [{ id: 'log-1' }], total: 42 })
            })
        })
    })
}
