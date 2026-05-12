/**
 * Unit tests for the OAuth2 refresh-token resolver
 * (`services/credentials/oauth2-refresh.ts`).
 *
 * Covers: freshness check (no refresh when access token is still valid),
 * proactive refresh on expiry / within the skew window, single-flight
 * de-duplication of concurrent calls for the same credential, transient
 * 5xx retry with eventual success, attempt-exhaustion failure, `invalid_grant`
 * (HTTP 400 / 401) → dependent MCP servers marked UNHEALTHY, malformed
 * decrypted payload, missing credential, refresh-token rotation
 * persistence, and the per-attempt credential_access_audit emit contract.
 */
export function oauth2RefreshServiceTest() {
    describe('OAuth2 Refresh Service', () => {
        let oauth2Refresh: any
        let mockAppServer: any
        let mockCredentialRepo: any
        let mockMCPServerRepo: any
        let mockMCPServerQueryBuilder: any
        let recordedAudits: any[]
        let savedCredentialPayloads: any[]
        let savedMCPServers: any[]

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
            // Stub decrypt to JSON.parse the encryptedData field directly so
            // each test can stage a payload by setting credential.encryptedData
            // to JSON.stringify(payload). Stub encrypt to do the inverse so
            // save inspections see plaintext.
            jest.doMock('../../src/utils', () => ({
                ...jest.requireActual('../../src/utils'),
                decryptCredentialData: jest.fn(async (encrypted: string) => JSON.parse(encrypted)),
                encryptCredentialData: jest.fn(async (plain: object) => JSON.stringify(plain))
            }))
            jest.doMock('../../src/services/audit', () => ({
                __esModule: true,
                default: {
                    recordCredentialAccess: jest.fn(async (input: any) => {
                        recordedAudits.push(input)
                    })
                }
            }))
        }

        const stagedCredential = (overrides: Partial<Record<string, unknown>> = {}) => {
            const payload = {
                type: 'oauth2-refresh',
                tokenEndpoint: 'https://example.com/oauth/token',
                clientId: 'client-id',
                clientSecret: 'client-secret',
                refreshToken: 'rtok-1',
                accessToken: 'atok-1',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                tokenType: 'Bearer',
                scope: 'read',
                ...overrides
            }
            return { id: 'cred-1', encryptedData: JSON.stringify(payload), name: 'oauth', credentialName: 'oauth2-refresh' }
        }

        beforeEach(() => {
            jest.resetModules()
            recordedAudits = []
            savedCredentialPayloads = []
            savedMCPServers = []

            mockCredentialRepo = {
                findOneBy: jest.fn(),
                save: jest.fn(async (entity: any) => {
                    savedCredentialPayloads.push(JSON.parse(entity.encryptedData))
                    return entity
                })
            }
            mockMCPServerQueryBuilder = {
                where: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([])
            }
            mockMCPServerRepo = {
                createQueryBuilder: jest.fn(() => mockMCPServerQueryBuilder),
                save: jest.fn(async (entity: any) => {
                    savedMCPServers.push(entity)
                    return entity
                })
            }
            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn((entity: any) => {
                        const name = typeof entity === 'function' ? entity.name : entity
                        if (name === 'Credential') return mockCredentialRepo
                        if (name === 'MCPServer') return mockMCPServerRepo
                        return mockCredentialRepo
                    })
                }
            }
            setupMocks()
            oauth2Refresh = require('../../src/services/credentials/oauth2-refresh')
            oauth2Refresh.__resetOAuth2RefreshInflight()
        })

        afterEach(() => {
            oauth2Refresh.__resetOAuth2RefreshInflight()
        })

        // ─── freshness check ──────────────────────────────────────────

        describe('freshness check', () => {
            it('returns the cached accessToken without contacting the token endpoint when expiresAt is still in the future', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential())
                const fetchImpl = jest.fn()
                const token = await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                expect(token).toBe('atok-1')
                expect(fetchImpl).not.toHaveBeenCalled()
                expect(mockCredentialRepo.save).not.toHaveBeenCalled()
                expect(recordedAudits).toHaveLength(1)
                expect(recordedAudits[0]).toMatchObject({
                    credentialId: 'cred-1',
                    source: 'oauth2-refresh',
                    success: true,
                    errorMessage: null
                })
            })

            it('refreshes when expiresAt is in the past', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'atok-2', expires_in: 3600, token_type: 'Bearer' })
                })
                const token = await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                expect(token).toBe('atok-2')
                expect(fetchImpl).toHaveBeenCalledTimes(1)
                expect(savedCredentialPayloads).toHaveLength(1)
                expect(savedCredentialPayloads[0]).toMatchObject({
                    type: 'oauth2-refresh',
                    accessToken: 'atok-2',
                    refreshToken: 'rtok-1',
                    tokenType: 'Bearer'
                })
            })

            it('refreshes when expiresAt is within the 30s skew window', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() + 5_000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'atok-skew', expires_in: 3600 })
                })
                const token = await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                expect(token).toBe('atok-skew')
                expect(fetchImpl).toHaveBeenCalledTimes(1)
            })
        })

        // ─── single-flight ────────────────────────────────────────────

        describe('single-flight', () => {
            it('coalesces concurrent refresh calls for the same credential into one POST', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                let resolveFetch: (value: any) => void = () => {}
                const fetchImpl = jest.fn(
                    () =>
                        new Promise((resolve) => {
                            resolveFetch = resolve
                        })
                )

                const promiseA = oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                const promiseB = oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                const promiseC = oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })

                // Drain microtasks so refreshWithRetry reaches fetchImpl()
                // and captures the real `resolveFetch` callback — otherwise we'd
                // call resolveFetch before fetchImpl is invoked and the inner
                // Promise would never settle.
                await new Promise((resolve) => setImmediate(resolve))

                resolveFetch({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'atok-sf', expires_in: 3600 })
                })
                const [tokenA, tokenB, tokenC] = await Promise.all([promiseA, promiseB, promiseC])
                expect(tokenA).toBe('atok-sf')
                expect(tokenB).toBe('atok-sf')
                expect(tokenC).toBe('atok-sf')
                expect(fetchImpl).toHaveBeenCalledTimes(1)
            })
        })

        // ─── transient failure → retry ────────────────────────────────

        describe('transient failures', () => {
            it('retries on a 5xx and succeeds on the third attempt', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest
                    .fn()
                    .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'oops' })
                    .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'still oops' })
                    .mockResolvedValueOnce({
                        ok: true,
                        status: 200,
                        json: async () => ({ access_token: 'atok-retry', expires_in: 3600 })
                    })
                const sleep = jest.fn().mockResolvedValue(undefined)
                const token = await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl, sleep })
                expect(token).toBe('atok-retry')
                expect(fetchImpl).toHaveBeenCalledTimes(3)
                expect(sleep).toHaveBeenCalledTimes(2)
                const failureAudits = recordedAudits.filter((row) => row.success === false)
                const successAudits = recordedAudits.filter((row) => row.success === true)
                expect(failureAudits).toHaveLength(2)
                expect(successAudits).toHaveLength(1)
            })

            it('throws after exhausting all retry attempts', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' })
                const sleep = jest.fn().mockResolvedValue(undefined)
                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl, sleep })).rejects.toMatchObject({
                    statusCode: 503
                })
                expect(fetchImpl).toHaveBeenCalledTimes(3)
                expect(recordedAudits.every((row) => row.success === false)).toBe(true)
                expect(recordedAudits).toHaveLength(3)
            })
        })

        // ─── invalid_grant ────────────────────────────────────────────

        describe('invalid_grant', () => {
            it('marks every dependent MCP server UNHEALTHY and throws 503 on HTTP 400', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                mockMCPServerQueryBuilder.getMany.mockResolvedValue([
                    {
                        id: 'srv-a',
                        outboundAuth: JSON.stringify({ type: 'oauth2-refresh', credentialId: 'cred-1' }),
                        status: 'HEALTHY'
                    },
                    {
                        id: 'srv-b',
                        outboundAuth: JSON.stringify({ type: 'oauth2-refresh', credentialId: 'cred-1' }),
                        status: 'HEALTHY'
                    },
                    // Different credential — must be skipped.
                    {
                        id: 'srv-c',
                        outboundAuth: JSON.stringify({ type: 'oauth2-refresh', credentialId: 'cred-other' }),
                        status: 'HEALTHY'
                    }
                ])
                const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' })

                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })).rejects.toMatchObject({
                    statusCode: 503
                })

                expect(fetchImpl).toHaveBeenCalledTimes(1)
                expect(savedMCPServers).toHaveLength(2)
                const savedIds = savedMCPServers.map((s) => s.id).sort()
                expect(savedIds).toEqual(['srv-a', 'srv-b'])
                for (const server of savedMCPServers) {
                    expect(server.status).toBe('UNHEALTHY')
                    expect(server.lastHealthError).toMatch(/re-authorize required/i)
                }
            })

            it('also handles HTTP 401 as invalid_grant', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })).rejects.toMatchObject({
                    statusCode: 503
                })
                expect(fetchImpl).toHaveBeenCalledTimes(1)
            })
        })

        // ─── malformed payload ────────────────────────────────────────

        describe('malformed payload', () => {
            it('throws 503 and marks dependent servers UNHEALTHY when the decrypted payload is missing required fields', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue({
                    id: 'cred-1',
                    encryptedData: JSON.stringify({ type: 'oauth2-refresh', clientId: 'only-this' })
                })
                mockMCPServerQueryBuilder.getMany.mockResolvedValue([
                    {
                        id: 'srv-a',
                        outboundAuth: JSON.stringify({ type: 'oauth2-refresh', credentialId: 'cred-1' }),
                        status: 'HEALTHY'
                    }
                ])
                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, {})).rejects.toMatchObject({
                    statusCode: 503
                })
                expect(savedMCPServers).toHaveLength(1)
                expect(savedMCPServers[0].status).toBe('UNHEALTHY')
                expect(recordedAudits[0].success).toBe(false)
            })

            it('throws 503 when the payload type is not oauth2-refresh', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue({
                    id: 'cred-1',
                    encryptedData: JSON.stringify({ type: 'bearer', token: 'static' })
                })
                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, {})).rejects.toMatchObject({
                    statusCode: 503
                })
            })
        })

        // ─── missing credential ───────────────────────────────────────

        describe('missing credential', () => {
            it('throws 404 and audits the failure when credentialId does not resolve', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(null)
                await expect(oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-missing' }, {})).rejects.toMatchObject({
                    statusCode: 404
                })
                expect(recordedAudits).toHaveLength(1)
                expect(recordedAudits[0]).toMatchObject({
                    credentialId: 'cred-missing',
                    success: false,
                    source: 'oauth2-refresh'
                })
            })
        })

        // ─── refresh-token rotation ───────────────────────────────────

        describe('refresh token rotation', () => {
            it('persists a rotated refresh_token returned by the provider', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'atok-new', refresh_token: 'rtok-2', expires_in: 3600 })
                })
                await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                expect(savedCredentialPayloads[0]).toMatchObject({ accessToken: 'atok-new', refreshToken: 'rtok-2' })
            })

            it('keeps the existing refresh_token when the provider does not return one', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
                const fetchImpl = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'atok-new', expires_in: 3600 })
                })
                await oauth2Refresh.ensureFreshAccessToken({ credentialId: 'cred-1' }, { fetchImpl })
                expect(savedCredentialPayloads[0].refreshToken).toBe('rtok-1')
            })
        })

        // ─── audit posture ────────────────────────────────────────────

        describe('audit posture', () => {
            it('threads userId / agentId / requestPath from auditContext into the audit row', async () => {
                mockCredentialRepo.findOneBy.mockResolvedValue(stagedCredential())
                await oauth2Refresh.ensureFreshAccessToken(
                    {
                        credentialId: 'cred-1',
                        auditContext: { userId: 'u-1', agentId: 'a-1', requestPath: '/api/v1/mcp-gateway/a-1' }
                    },
                    { fetchImpl: jest.fn() }
                )
                expect(recordedAudits[0]).toMatchObject({
                    userId: 'u-1',
                    agentId: 'a-1',
                    requestPath: '/api/v1/mcp-gateway/a-1'
                })
            })
        })
    })
}
