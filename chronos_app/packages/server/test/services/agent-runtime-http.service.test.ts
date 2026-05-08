/**
 * Test suite for the HTTP Agent Runtime (v1.6.0).
 * Verifies outbound auth resolution, callback URL injection, timeout
 * handling, non-2xx upstream errors, JSON pass-through, and synthetic
 * Execution + ExecutionMetrics emission.
 */
export function agentRuntimeHttpServiceTest() {
    describe('HTTP Agent Runtime', () => {
        let runtime: any
        let mockAppServer: any
        let mockExecutionRepo: any
        let mockMetricsRepo: any
        let mockCredentialRepo: any
        let originalFetch: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
            jest.doMock('../../src/utils', () => ({
                ...jest.requireActual('../../src/utils'),
                decryptCredentialData: jest.fn(async (encrypted: string) => ({ apiKey: `decrypted:${encrypted}` }))
            }))
        }

        beforeEach(() => {
            jest.resetModules()
            jest.dontMock('../../src/services/agent-runtime-http')
            jest.dontMock('../../src/utils/buildAgentflow')

            mockExecutionRepo = {
                create: jest.fn((entity: any) => ({ id: 'exec-1', ...entity })),
                save: jest.fn((entity: any) => Promise.resolve(entity))
            }
            mockMetricsRepo = {
                create: jest.fn((entity: any) => entity),
                save: jest.fn((entity: any) => Promise.resolve(entity))
            }
            mockCredentialRepo = {
                findOneBy: jest.fn().mockResolvedValue({ id: 'cred-1', encryptedData: 'enc' })
            }
            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn((entity: any) => {
                        const name = typeof entity === 'function' ? entity.name : entity
                        if (name === 'Execution') return mockExecutionRepo
                        if (name === 'ExecutionMetrics') return mockMetricsRepo
                        if (name === 'Credential') return mockCredentialRepo
                        return mockExecutionRepo
                    })
                }
            }
            setupMocks()
            runtime = require('../../src/services/agent-runtime-http').default

            originalFetch = global.fetch
        })

        afterEach(() => {
            global.fetch = originalFetch
        })

        const buildReqRes = (overrides: any = {}) => {
            const req: any = {
                params: {},
                body: {},
                headers: {},
                protocol: 'http',
                get: jest.fn((key: string) => {
                    if (key === 'host') return 'chronos.local'
                    return undefined
                }),
                ...overrides
            }
            const res: any = {
                setHeader: jest.fn(),
                flushHeaders: jest.fn(),
                json: jest.fn(),
                end: jest.fn(),
                write: jest.fn(),
                writableEnded: false,
                headersSent: false
            }
            return { req, res }
        }

        const baseAgent = (overrides: any = {}) => ({
            id: 'agent-1',
            slug: 'my-http',
            serviceEndpoint: 'https://upstream.example.com',
            runtimeConfig: JSON.stringify({ timeoutMs: 5000 }),
            outboundAuth: undefined,
            ...overrides
        })

        // ─── outbound auth ─────────────────────────────────────────────

        describe('resolveOutboundAuth', () => {
            it('returns empty when outboundAuth missing', async () => {
                expect(await runtime.resolveOutboundAuth(undefined)).toEqual({})
            })

            it('builds Authorization header from inline bearer token', async () => {
                expect(await runtime.resolveOutboundAuth(JSON.stringify({ type: 'bearer', token: 'tok' }))).toEqual({
                    Authorization: 'Bearer tok'
                })
            })

            it('builds Authorization header from credentialId via decrypt', async () => {
                const headers = await runtime.resolveOutboundAuth(JSON.stringify({ type: 'bearer', credentialId: 'cred-1' }))
                expect(headers.Authorization).toBe('Bearer decrypted:enc')
            })

            it('builds custom header from inline value', async () => {
                expect(await runtime.resolveOutboundAuth(JSON.stringify({ type: 'header', name: 'X-Token', value: 'v1' }))).toEqual({
                    'X-Token': 'v1'
                })
            })

            it('returns {} for unknown auth type', async () => {
                expect(await runtime.resolveOutboundAuth(JSON.stringify({ type: 'mtls' }))).toEqual({})
            })
        })

        // ─── invoke happy paths ────────────────────────────────────────

        describe('invoke', () => {
            it('rejects when agent has no serviceEndpoint', async () => {
                const { req, res } = buildReqRes()
                await expect(runtime.invoke(baseAgent({ serviceEndpoint: undefined }), {}, req, res)).rejects.toMatchObject({
                    statusCode: 400
                })
            })

            it('forwards JSON, injects callback URL + headers, returns upstream payload', async () => {
                const upstreamPayload = {
                    id: 'cmpl-x',
                    choices: [{ message: { content: 'ok' } }],
                    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 }
                }
                const fetchMock = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Map([['content-type', 'application/json']]),
                    json: async () => upstreamPayload
                })
                global.fetch = fetchMock as any

                const { req, res } = buildReqRes()
                await runtime.invoke(
                    baseAgent({ outboundAuth: JSON.stringify({ type: 'bearer', token: 'TKN' }) }),
                    { messages: [{ role: 'user', content: 'hi' }] },
                    req,
                    res
                )

                expect(fetchMock).toHaveBeenCalledTimes(1)
                const [url, opts] = fetchMock.mock.calls[0]
                expect(url).toBe('https://upstream.example.com/v1/chat/completions')
                expect(opts.headers.Authorization).toBe('Bearer TKN')
                expect(opts.headers['x-chronos-callback-url']).toMatch(/\/api\/v1\/agent-callbacks\/agent-1\/tools\/invoke$/)
                const body = JSON.parse(opts.body)
                expect(body.x_chronos_callback_url).toMatch(/agent-callbacks\/agent-1/)
                expect(body.x_chronos_call_id).toBeDefined()
                expect(res.json).toHaveBeenCalledWith(upstreamPayload)

                expect(mockExecutionRepo.create).toHaveBeenCalled()
                expect(mockMetricsRepo.save).toHaveBeenCalled()
                const metrics = mockMetricsRepo.save.mock.calls[0][0]
                expect(metrics.agentflowId).toBe('agent-1')
                expect(metrics.state).toBe('FINISHED')
                expect(metrics.triggerType).toBe('api')
                expect(metrics.inputTokens).toBe(12)
                expect(metrics.outputTokens).toBe(7)
                expect(metrics.totalTokens).toBe(19)
            })

            it('preserves the start-phase request alongside the finish-phase response on the persisted executionData', async () => {
                // v1.7 regression — writeFinishExecution used to clobber
                // executionData with just the response, dropping the
                // start-phase `request`. The UI's HTTP execution viewer
                // reads `payload.request` to render the "Request to {agent}"
                // tree child; this test locks the merge in place.
                const upstreamPayload = {
                    id: 'cmpl-x',
                    choices: [{ message: { content: 'merged' } }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
                }
                global.fetch = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Map([['content-type', 'application/json']]),
                    json: async () => upstreamPayload
                }) as any

                const { req, res } = buildReqRes()
                await runtime.invoke(baseAgent(), { messages: [{ role: 'user', content: 'hi' }], model: 'test-model' }, req, res)

                // The runtime saves twice: once at start (with request), once at finish (with merge).
                // The final save is the one that matters — must carry both keys.
                const lastSave = mockExecutionRepo.save.mock.calls[mockExecutionRepo.save.mock.calls.length - 1][0]
                const persisted = JSON.parse(lastSave.executionData)
                expect(persisted.request).toBeDefined()
                expect(persisted.request.messages?.[0]?.content).toBe('hi')
                expect(persisted.request.model).toBe('test-model')
                expect(persisted.response).toBeDefined()
                expect(persisted.response.choices?.[0]?.message?.content).toBe('merged')
                expect(persisted.callId).toBeDefined()
            })

            it('parses Responses API token usage shape (input_tokens / output_tokens)', async () => {
                global.fetch = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Map([['content-type', 'application/json']]),
                    json: async () => ({ output: [], usage: { input_tokens: 30, output_tokens: 5, total_tokens: 35 } })
                }) as any
                const { req, res } = buildReqRes()
                await runtime.invoke(baseAgent(), { messages: [] }, req, res)
                const metrics = mockMetricsRepo.save.mock.calls[0][0]
                expect(metrics.inputTokens).toBe(30)
                expect(metrics.outputTokens).toBe(5)
                expect(metrics.totalTokens).toBe(35)
            })

            it('falls back to zero token counts when upstream omits the usage block', async () => {
                global.fetch = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Map([['content-type', 'application/json']]),
                    json: async () => ({ id: 'cmpl-y', choices: [{ message: { content: 'ok' } }] })
                }) as any
                const { req, res } = buildReqRes()
                await runtime.invoke(baseAgent(), { messages: [] }, req, res)
                const metrics = mockMetricsRepo.save.mock.calls[0][0]
                expect(metrics.inputTokens).toBe(0)
                expect(metrics.outputTokens).toBe(0)
                expect(metrics.totalTokens).toBe(0)
            })

            it('maps non-2xx upstream to 502 BAD_GATEWAY and writes ERROR metrics', async () => {
                global.fetch = jest.fn().mockResolvedValue({
                    ok: false,
                    status: 503,
                    headers: new Map(),
                    text: async () => 'upstream broken',
                    json: async () => ({})
                }) as any
                const { req, res } = buildReqRes()
                await expect(runtime.invoke(baseAgent(), {}, req, res)).rejects.toMatchObject({ statusCode: 502 })
                const metrics = mockMetricsRepo.save.mock.calls[0][0]
                expect(metrics.state).toBe('ERROR')
            })

            it('maps AbortError to 504 GATEWAY_TIMEOUT', async () => {
                const abortError = Object.assign(new Error('abort'), { name: 'AbortError' })
                global.fetch = jest.fn().mockRejectedValue(abortError) as any
                const { req, res } = buildReqRes()
                await expect(runtime.invoke(baseAgent(), {}, req, res)).rejects.toMatchObject({ statusCode: 504 })
            })

            it('maps other fetch errors to 502 BAD_GATEWAY', async () => {
                global.fetch = jest.fn().mockRejectedValue(new Error('econnrefused')) as any
                const { req, res } = buildReqRes()
                await expect(runtime.invoke(baseAgent(), {}, req, res)).rejects.toMatchObject({ statusCode: 502 })
            })
        })
    })
}
