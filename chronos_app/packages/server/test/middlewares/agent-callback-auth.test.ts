/**
 * Test suite for the agentCallbackAuth middleware (v1.6.0 — Group D).
 * Covers all auth failure modes plus the happy path. Uses jest.fn() req/res
 * mocks rather than supertest — the middleware is small enough that an
 * isolated unit test reads cleaner than a full route fixture.
 */
export function agentCallbackAuthMiddlewareTest() {
    describe('agentCallbackAuth middleware', () => {
        let agentCallbackAuth: any
        let mockAgentRepo: any
        let mockAppServer: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
        }

        beforeEach(() => {
            jest.resetModules()
            mockAgentRepo = {
                findOneBy: jest.fn().mockResolvedValue(null)
            }
            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn(() => mockAgentRepo)
                }
            }
            setupMocks()
            agentCallbackAuth = require('../../src/middlewares/agentCallbackAuth').agentCallbackAuth
        })

        const buildReq = (overrides: any = {}) => ({
            headers: {},
            // The middleware's UUID gate (added v1.6 release-prep) skips the
            // DB lookup for non-UUID agent IDs, so fixtures must use a
            // valid-looking UUID even though the mock repo returns whatever
            // `mockResolvedValue` is set to. Real callers always pass UUIDs
            // anyway — Express captures `:agentId` from the URL.
            params: { agentId: '11111111-2222-4333-8444-555555555555' },
            ...overrides
        })

        const buildRes = () => {
            const res: any = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis()
            }
            return res
        }

        it('rejects when Authorization header is missing', async () => {
            const req = buildReq()
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('rejects when Authorization header lacks Bearer prefix', async () => {
            const req = buildReq({ headers: { authorization: 'Basic abc' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('rejects when Bearer token is empty', async () => {
            const req = buildReq({ headers: { authorization: 'Bearer ' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('returns 401 when agent not found (does not leak existence)', async () => {
            mockAgentRepo.findOneBy.mockResolvedValue(null)
            const req = buildReq({ headers: { authorization: 'Bearer abc123' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('returns 401 when token does not match stored callbackToken', async () => {
            mockAgentRepo.findOneBy.mockResolvedValue({
                id: 'agent-1',
                callbackToken: 'storedTOKEN',
                runtimeType: 'HTTP',
                enabled: true
            })
            const req = buildReq({ headers: { authorization: 'Bearer wrongTOKEN' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('returns 403 when agent is BUILT_IN (not HTTP)', async () => {
            mockAgentRepo.findOneBy.mockResolvedValue({
                id: 'agent-1',
                callbackToken: 'tok',
                runtimeType: 'BUILT_IN',
                enabled: true
            })
            const req = buildReq({ headers: { authorization: 'Bearer tok' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(403)
            expect(next).not.toHaveBeenCalled()
        })

        it('returns 403 when agent is disabled', async () => {
            mockAgentRepo.findOneBy.mockResolvedValue({
                id: 'agent-1',
                callbackToken: 'tok',
                runtimeType: 'HTTP',
                enabled: false
            })
            const req = buildReq({ headers: { authorization: 'Bearer tok' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(403)
            expect(next).not.toHaveBeenCalled()
        })

        it('attaches req.callbackAgent and calls next() on a valid match', async () => {
            const agent = {
                id: 'agent-1',
                callbackToken: 'good-token-value',
                runtimeType: 'HTTP',
                enabled: true
            }
            mockAgentRepo.findOneBy.mockResolvedValue(agent)
            const req: any = buildReq({ headers: { authorization: 'Bearer good-token-value' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(next).toHaveBeenCalledTimes(1)
            expect(req.callbackAgent).toBe(agent)
            expect(res.status).not.toHaveBeenCalled()
        })

        it('rejects when supplied token is a prefix of the stored token', async () => {
            mockAgentRepo.findOneBy.mockResolvedValue({
                id: 'agent-1',
                callbackToken: 'abcdefgh',
                runtimeType: 'HTTP',
                enabled: true
            })
            const req = buildReq({ headers: { authorization: 'Bearer abcd' } })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        it('returns 401 without hitting the DB when agentId is not a UUID (Postgres uuid-column gate)', async () => {
            const req = buildReq({
                headers: { authorization: 'Bearer anything' },
                params: { agentId: 'not-a-uuid' }
            })
            const res = buildRes()
            const next = jest.fn()
            await agentCallbackAuth(req, res, next)
            expect(mockAgentRepo.findOneBy).not.toHaveBeenCalled()
            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })
    })
}
