import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for v1.7 § 3a auditService.
 * Covers the best-effort write contract (DB errors swallowed, never re-thrown
 * to the caller) and the callId read helper used by the smoke runner and the
 * v1.7 § 6 HTTP-agent execution viewer.
 */
export function auditServiceTest() {
    describe('Audit Service', () => {
        let auditService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
        }

        beforeEach(() => {
            // Re-establish mocks per-test because earlier suites in the run order
            // (mcp-gateway) leave `jest.doMock('../../src/services/audit', ...)`
            // registered AND call `jest.resetModules()` themselves. Without
            // `unmock`, our `require('../../src/services/audit')` would return
            // the gateway-test stub instead of the real implementation.
            jest.resetModules()
            jest.unmock('../../src/services/audit')
            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockAppServer = {
                AppDataSource: { getRepository: jest.fn().mockReturnValue(mockRepository) }
            }
            setupMocks()
            auditService = require('../../src/services/audit').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        const baseInput = (overrides: Partial<Record<string, unknown>> = {}) => ({
            agentId: 'agent-1',
            agentSlug: 'my-agent',
            mcpServerId: 'srv-1',
            mcpServerSlug: 'postgres',
            toolName: 'query',
            namespacedTool: 'postgres.query',
            success: true,
            durationMs: 42,
            errorMessage: null,
            callId: 'call-1',
            userId: 'user-1',
            ...overrides
        })

        describe('recordToolInvocation', () => {
            it('inserts a row with the input payload verbatim', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'audit-1' }] } as any)
                const input = baseInput()
                await auditService.recordToolInvocation(input)
                expect(mockRepository.insert).toHaveBeenCalledWith(input)
            })

            it('swallows DB errors so the gateway invoke hot path is never affected', async () => {
                mockRepository.insert.mockRejectedValue(new Error('connection lost'))
                await expect(auditService.recordToolInvocation(baseInput())).resolves.toBeUndefined()
            })

            it('persists failure rows with success=false and the operator-friendly errorMessage', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'audit-2' }] } as any)
                const input = baseInput({ success: false, errorMessage: 'rpc broken' })
                await auditService.recordToolInvocation(input)
                expect(mockRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, errorMessage: 'rpc broken' }))
            })
        })

        describe('listToolInvocations', () => {
            it('returns the full result set with no filters and no pagination, ordered DESC by createdDate', async () => {
                const rows = [{ id: 'a' }, { id: 'b' }]
                mockQueryBuilder.getMany.mockResolvedValue(rows as any)
                const result = await auditService.listToolInvocations()
                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('audit')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('audit.createdDate', 'DESC')
                expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled()
                expect(result).toBe(rows)
            })

            it.each([
                ['agentId', 'agent-1', 'audit.agentId = :agentId', { agentId: 'agent-1' }],
                ['mcpServerId', 'srv-1', 'audit.mcpServerId = :mcpServerId', { mcpServerId: 'srv-1' }],
                ['namespacedTool', 'postgres.query', 'audit.namespacedTool = :namespacedTool', { namespacedTool: 'postgres.query' }],
                ['callId', 'call-7', 'audit.callId = :callId', { callId: 'call-7' }],
                ['userId', 'user-9', 'audit.userId = :userId', { userId: 'user-9' }]
            ])('applies %s filter as andWhere with the right binding', async (key, value, sql, binding) => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                await auditService.listToolInvocations({ [key]: value })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(sql, binding)
            })

            it('coerces the success boolean correctly when filtered as true', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                await auditService.listToolInvocations({ success: true })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.success = :success', { success: true })
            })

            it('applies startDate / endDate as Date-typed lower / upper bounds on createdDate', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                await auditService.listToolInvocations({ startDate: '2026-05-01T00:00:00Z', endDate: '2026-05-07T00:00:00Z' })
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.createdDate >= :startDate', expect.objectContaining({}))
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.createdDate <= :endDate', expect.objectContaining({}))
                const startCall = mockQueryBuilder.andWhere.mock.calls.find((c: any[]) => c[0] === 'audit.createdDate >= :startDate')
                const endCall = mockQueryBuilder.andWhere.mock.calls.find((c: any[]) => c[0] === 'audit.createdDate <= :endDate')
                expect(startCall?.[1].startDate).toBeInstanceOf(Date)
                expect(endCall?.[1].endDate).toBeInstanceOf(Date)
            })

            it('rejects an invalid startDate with 400', async () => {
                await expect(auditService.listToolInvocations({ startDate: 'not-a-date' })).rejects.toMatchObject({ statusCode: 400 })
            })

            it('rejects an invalid endDate with 400', async () => {
                await expect(auditService.listToolInvocations({ endDate: 'garbage' })).rejects.toMatchObject({ statusCode: 400 })
            })

            it('returns { data, total } and applies skip/take when paginated', async () => {
                const rows = [{ id: 'a' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([rows as any, 42])
                const result = await auditService.listToolInvocations({}, { page: 3, limit: 10 })
                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(10)
                expect(result).toEqual({ data: rows, total: 42 })
            })

            it('does NOT paginate when only one of page / limit is provided', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                await auditService.listToolInvocations({}, { page: 2 })
                expect(mockQueryBuilder.skip).not.toHaveBeenCalled()
                expect(mockQueryBuilder.take).not.toHaveBeenCalled()
            })
        })

        describe('exportToolInvocationsCsv', () => {
            const sampleRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
                id: 'r1',
                agentId: 'agent-1',
                agentSlug: 'my-agent',
                mcpServerId: 'srv-1',
                mcpServerSlug: 'postgres',
                toolName: 'query',
                namespacedTool: 'postgres.query',
                success: true,
                durationMs: 42,
                errorMessage: null,
                callId: 'call-1',
                userId: 'user-1',
                createdDate: new Date('2026-05-07T00:00:00Z'),
                ...overrides
            })

            it('emits a fixed-order header line and one row per audit entry', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([sampleRow()])
                const csv = await auditService.exportToolInvocationsCsv()
                const lines = csv.split('\n')
                expect(lines[0]).toBe(
                    'id,agentId,agentSlug,mcpServerId,mcpServerSlug,toolName,namespacedTool,success,durationMs,errorMessage,callId,userId,policyOutcome,requestPayload,responsePayload,createdDate'
                )
                expect(lines).toHaveLength(2)
                expect(lines[1]).toContain('"r1"')
                expect(lines[1]).toContain('"postgres.query"')
                expect(lines[1]).toContain('true')
                expect(lines[1]).toContain('"2026-05-07T00:00:00.000Z"')
            })

            it('emits empty cells for nulls (errorMessage on success rows)', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([sampleRow({ errorMessage: null, callId: null, userId: null })])
                const csv = await auditService.exportToolInvocationsCsv()
                const dataLine = csv.split('\n')[1]
                // Three null fields → three consecutive empty cells, sandwiched by the surrounding values.
                expect(dataLine).toContain(',,,,')
            })

            it('emits a header-only string when no rows match', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                const csv = await auditService.exportToolInvocationsCsv()
                expect(csv.split('\n')).toHaveLength(1)
                expect(csv).toContain('id,agentId')
            })

            it('caps the row export at 10000 via a take clause', async () => {
                mockQueryBuilder.getMany.mockResolvedValue([])
                await auditService.exportToolInvocationsCsv({ agentId: 'agent-1' })
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(10000)
                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.agentId = :agentId', { agentId: 'agent-1' })
            })
        })

        // ─── credential-access audit (v1.7 § 3d) ───────────────────────

        const baseCredentialAccessInput = (overrides: Partial<Record<string, unknown>> = {}) => ({
            credentialId: 'cred-1',
            userId: 'user-1',
            agentId: null,
            source: 'oauth2.authorize',
            requestPath: '/api/v1/oauth2/authorize/cred-1',
            success: true,
            errorMessage: null,
            ...overrides
        })

        describe('recordCredentialAccess', () => {
            it('inserts a row with the input payload verbatim', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'audit-c1' }] } as any)
                const input = baseCredentialAccessInput()
                await auditService.recordCredentialAccess(input)
                expect(mockRepository.insert).toHaveBeenCalledWith(input)
            })

            it('swallows DB errors so the decrypt hot path is never affected', async () => {
                mockRepository.insert.mockRejectedValue(new Error('connection lost'))
                await expect(auditService.recordCredentialAccess(baseCredentialAccessInput())).resolves.toBeUndefined()
            })

            it('persists failure rows with success=false and errorMessage', async () => {
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'audit-c2' }] } as any)
                const input = baseCredentialAccessInput({ success: false, errorMessage: 'Encryption mismatch' })
                await auditService.recordCredentialAccess(input)
                expect(mockRepository.insert).toHaveBeenCalledWith(
                    expect.objectContaining({ success: false, errorMessage: 'Encryption mismatch' })
                )
            })
        })

        describe('listCredentialAccessByCredentialId', () => {
            it('returns rows for the given credentialId in chronological order', async () => {
                const rows = [{ id: 'a' }, { id: 'b' }]
                mockRepository.find.mockResolvedValue(rows as any)
                const result = await auditService.listCredentialAccessByCredentialId('cred-1')
                expect(mockRepository.find).toHaveBeenCalledWith({ where: { credentialId: 'cred-1' }, order: { createdDate: 'ASC' } })
                expect(result).toBe(rows)
            })

            it('returns an empty array when no rows match', async () => {
                mockRepository.find.mockResolvedValue([])
                const result = await auditService.listCredentialAccessByCredentialId('unknown')
                expect(result).toEqual([])
            })
        })
    })
}
