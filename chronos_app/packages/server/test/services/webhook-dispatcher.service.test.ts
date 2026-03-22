import crypto from 'crypto'

/**
 * Test suite for WebhookDispatcher service
 * Tests event mapping, HMAC verification, retry logic, delivery logging, and no-op when disabled
 */
export function webhookDispatcherServiceTest() {
    describe('WebhookDispatcher Service', () => {
        let dispatchWebhooks: any
        let mockWebhookRepo: any
        let mockDeliveryRepo: any
        let mockDataSource: any
        let originalFetch: typeof global.fetch

        const setupMocks = () => {
            jest.doMock('../../src/utils/logger', () => ({
                __esModule: true,
                default: {
                    info: jest.fn(),
                    warn: jest.fn(),
                    error: jest.fn(),
                    debug: jest.fn()
                }
            }))
        }

        beforeAll(() => {
            jest.resetModules()
            process.env.ENABLE_WEBHOOKS = 'true'

            originalFetch = global.fetch

            mockWebhookRepo = {
                save: jest.fn().mockResolvedValue({}),
                find: jest.fn().mockResolvedValue([]),
                findOne: jest.fn()
            }

            mockDeliveryRepo = {
                save: jest.fn().mockResolvedValue({})
            }

            mockDataSource = {
                getRepository: jest.fn((entity: any) => {
                    const name = typeof entity === 'function' ? entity.name : entity
                    if (name === 'WebhookDelivery') return mockDeliveryRepo
                    return mockWebhookRepo
                })
            }

            setupMocks()

            dispatchWebhooks = require('../../src/services/webhook-dispatcher').dispatchWebhooks
        })

        afterAll(() => {
            global.fetch = originalFetch
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockDataSource.getRepository.mockImplementation((entity: any) => {
                const name = typeof entity === 'function' ? entity.name : entity
                if (name === 'WebhookDelivery') return mockDeliveryRepo
                return mockWebhookRepo
            })
            // Default: no webhooks found
            mockWebhookRepo.find.mockResolvedValue([])
        })

        // ─── event mapping ───────────────────────────────────────────

        describe('event mapping', () => {
            it('should not dispatch for INPROGRESS state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('INPROGRESS'), 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()
            })

            it('should not dispatch for STOPPED state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('STOPPED'), 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()
            })

            it('should query webhooks for FINISHED state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                expect(mockWebhookRepo.find).toHaveBeenCalledWith({
                    where: { agentflowId: 'flow-1', enabled: true }
                })
            })

            it('should query webhooks for ERROR state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('ERROR'), 'manual')
                expect(mockWebhookRepo.find).toHaveBeenCalled()
            })

            it('should query webhooks for TIMEOUT state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('TIMEOUT'), 'manual')
                expect(mockWebhookRepo.find).toHaveBeenCalled()
            })

            it('should query webhooks for TERMINATED state', async () => {
                await dispatchWebhooks(mockDataSource, createExecution('TERMINATED'), 'manual')
                expect(mockWebhookRepo.find).toHaveBeenCalled()
            })

            it('should map FINISHED to execution.completed in payload', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.event).toBe('execution.completed')
            })

            it('should map ERROR to execution.failed in payload', async () => {
                const webhook = createWebhook(['execution.failed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('ERROR'), 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.event).toBe('execution.failed')
            })

            it('should map TERMINATED to execution.failed in payload', async () => {
                const webhook = createWebhook(['execution.failed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('TERMINATED'), 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.event).toBe('execution.failed')
            })

            it('should map TIMEOUT to execution.timeout in payload', async () => {
                const webhook = createWebhook(['execution.timeout'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('TIMEOUT'), 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.event).toBe('execution.timeout')
            })
        })

        // ─── no-op when disabled ─────────────────────────────────────

        describe('no-op when disabled', () => {
            it('should not dispatch when ENABLE_WEBHOOKS is not true', async () => {
                const original = process.env.ENABLE_WEBHOOKS
                process.env.ENABLE_WEBHOOKS = 'false'

                jest.resetModules()
                setupMocks()
                const { dispatchWebhooks: dispatch } = require('../../src/services/webhook-dispatcher')

                await dispatch(mockDataSource, createExecution('FINISHED'), 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()

                process.env.ENABLE_WEBHOOKS = original
                jest.resetModules()
                setupMocks()
                dispatchWebhooks = require('../../src/services/webhook-dispatcher').dispatchWebhooks
            })
        })

        // ─── missing execution data ──────────────────────────────────

        describe('missing execution data', () => {
            it('should not dispatch without execution id', async () => {
                await dispatchWebhooks(mockDataSource, { agentflowId: 'flow-1', state: 'FINISHED' } as any, 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()
            })

            it('should not dispatch without agentflowId', async () => {
                await dispatchWebhooks(mockDataSource, { id: 'exec-1', state: 'FINISHED' } as any, 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()
            })

            it('should not dispatch without state', async () => {
                await dispatchWebhooks(mockDataSource, { id: 'exec-1', agentflowId: 'flow-1' } as any, 'manual')
                expect(mockWebhookRepo.find).not.toHaveBeenCalled()
            })
        })

        // ─── webhook event filtering ─────────────────────────────────

        describe('webhook event filtering', () => {
            it('should skip webhook not subscribed to the event', async () => {
                const webhook = createWebhook(['execution.failed', 'execution.timeout'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = jest.fn() as any
                global.fetch = mockFetch

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockFetch).not.toHaveBeenCalled()
            })

            it('should skip webhooks with unparseable events JSON', async () => {
                const webhook = { ...createWebhook([]), events: 'not-json' }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = jest.fn() as any
                global.fetch = mockFetch

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockFetch).not.toHaveBeenCalled()
            })
        })

        // ─── early exit ──────────────────────────────────────────────

        describe('early exit', () => {
            it('should return immediately when no webhooks found', async () => {
                mockWebhookRepo.find.mockResolvedValue([])
                const mockFetch = jest.fn() as any
                global.fetch = mockFetch

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')

                expect(mockFetch).not.toHaveBeenCalled()
                expect(mockDeliveryRepo.save).not.toHaveBeenCalled()
            })
        })

        // ─── payload construction ────────────────────────────────────

        describe('payload construction', () => {
            it('should compute durationMs from stoppedDate minus createdDate', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                const execution = {
                    ...createExecution('FINISHED'),
                    createdDate: new Date('2024-01-01T00:00:00Z'),
                    stoppedDate: new Date('2024-01-01T00:01:30Z')
                }

                await dispatchWebhooks(mockDataSource, execution, 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.execution.durationMs).toBe(90000) // 1.5 minutes
            })

            it('should fall back to updatedDate minus createdDate when no stoppedDate', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                const execution = {
                    id: 'exec-1',
                    agentflowId: 'flow-1',
                    state: 'FINISHED',
                    sessionId: 'session-1',
                    executionData: JSON.stringify([]),
                    createdDate: new Date('2024-01-01T00:00:00Z'),
                    updatedDate: new Date('2024-01-01T00:02:00Z'),
                    stoppedDate: undefined as any
                }

                await dispatchWebhooks(mockDataSource, execution, 'api')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.execution.durationMs).toBe(120000) // 2 minutes
            })

            it('should include execution metadata in payload', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'api')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.execution.id).toBe('exec-1')
                expect(body.execution.agentflowId).toBe('flow-1')
                expect(body.execution.sessionId).toBe('session-1')
                expect(body.execution.state).toBe('FINISHED')
                expect(body.execution.triggerType).toBe('api')
                expect(body.timestamp).toBeDefined()
            })

            it('should extract last node output as result', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                const execution = {
                    ...createExecution('FINISHED'),
                    executionData: JSON.stringify([
                        { nodeLabel: 'First', nodeId: 'n1', data: { output: 'first' }, previousNodeIds: [] },
                        { nodeLabel: 'Last', nodeId: 'n2', data: { output: 'final-result' }, previousNodeIds: ['n1'] }
                    ])
                }

                await dispatchWebhooks(mockDataSource, execution, 'manual')
                await flushDeliveries()

                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.result).toEqual({ output: 'final-result' })
            })

            it('should not crash when executionData is invalid JSON', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                const execution = {
                    ...createExecution('FINISHED'),
                    executionData: 'not-valid-json'
                }

                await dispatchWebhooks(mockDataSource, execution, 'manual')
                await flushDeliveries()

                // Should still deliver with empty result
                const body = JSON.parse(mockFetch.mock.calls[0][1].body)
                expect(body.result).toEqual({})
            })
        })

        // ─── HMAC signing ────────────────────────────────────────────

        describe('HMAC signing', () => {
            it('should produce valid HMAC-SHA256 signature header', async () => {
                const secret = 'my-test-secret'
                const webhook = { ...createWebhook(['execution.completed']), secret }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                const call = mockFetch.mock.calls[0]
                const headers = call[1].headers
                const body = call[1].body

                expect(headers['X-Chronos-Signature-256']).toBeDefined()

                // Verify the signature independently
                const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')
                expect(headers['X-Chronos-Signature-256']).toBe(`sha256=${expectedSig}`)
            })

            it('should skip HMAC header when webhook has no secret', async () => {
                const webhook = { ...createWebhook(['execution.completed']), secret: null }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                const headers = mockFetch.mock.calls[0][1].headers
                expect(headers['X-Chronos-Signature-256']).toBeUndefined()
            })
        })

        // ─── headers ─────────────────────────────────────────────────

        describe('headers', () => {
            it('should set correct headers', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const mockFetch = mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                const headers = mockFetch.mock.calls[0][1].headers
                expect(headers['Content-Type']).toBe('application/json')
                expect(headers['X-Chronos-Event']).toBe('execution.completed')
                expect(headers['X-Chronos-Delivery']).toBeDefined()
                expect(headers['User-Agent']).toBe('Chronos-Webhooks/1.0')
            })
        })

        // ─── delivery logging ────────────────────────────────────────

        describe('delivery logging', () => {
            it('should save WebhookDelivery with success=true on HTTP 200', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(1)
                const saved = mockDeliveryRepo.save.mock.calls[0][0]
                expect(saved.success).toBe(true)
                expect(saved.statusCode).toBe(200)
                expect(saved.webhookId).toBe('webhook-1')
                expect(saved.event).toBe('execution.completed')
                expect(saved.attempt).toBe(1)
                expect(saved.deliveredAt).toBeDefined()
            })

            it('should save WebhookDelivery with success=false on HTTP 500', async () => {
                const webhook = { ...createWebhook(['execution.completed']), maxRetries: 0 }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                mockFailedFetch(500)

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(1)
                const saved = mockDeliveryRepo.save.mock.calls[0][0]
                expect(saved.success).toBe(false)
                expect(saved.statusCode).toBe(500)
            })

            it('should save delivery with errorMessage on fetch exception', async () => {
                const webhook = { ...createWebhook(['execution.completed']), maxRetries: 0 }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(1)
                const saved = mockDeliveryRepo.save.mock.calls[0][0]
                expect(saved.success).toBe(false)
                expect(saved.errorMessage).toContain('ECONNREFUSED')
            })

            it('should truncate responseBody to 4KB', async () => {
                const webhook = createWebhook(['execution.completed'])
                mockWebhookRepo.find.mockResolvedValue([webhook])
                const largeBody = 'x'.repeat(8000)
                global.fetch = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    text: jest.fn().mockResolvedValue(largeBody)
                }) as any

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                const saved = mockDeliveryRepo.save.mock.calls[0][0]
                expect(saved.responseBody.length).toBe(4096)
            })
        })

        // ─── retry logic ─────────────────────────────────────────────

        describe('retry logic', () => {
            it('should retry on failure up to maxRetries+1 total attempts', async () => {
                // Use maxRetries=1 so total attempts = 2 with a 1s backoff — manageable with real timers
                const webhook = { ...createWebhook(['execution.completed']), maxRetries: 1 }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                mockFailedFetch(503)

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')

                // Wait long enough for backoff (1s) plus settling time
                await new Promise((r) => setTimeout(r, 2500))

                // maxRetries=1 means 2 total attempts (1 initial + 1 retry)
                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(2)

                // Verify attempt numbers
                const attempts = mockDeliveryRepo.save.mock.calls.map((c: any) => c[0].attempt)
                expect(attempts).toEqual([1, 2])
            }, 10000)

            it('should not retry after a successful delivery', async () => {
                const webhook = { ...createWebhook(['execution.completed']), maxRetries: 3 }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                // Only 1 attempt since first succeeded
                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(1)
                expect(mockDeliveryRepo.save.mock.calls[0][0].attempt).toBe(1)
                expect(mockDeliveryRepo.save.mock.calls[0][0].success).toBe(true)
            })

            it('should handle zero maxRetries (single attempt only)', async () => {
                const webhook = { ...createWebhook(['execution.completed']), maxRetries: 0 }
                mockWebhookRepo.find.mockResolvedValue([webhook])
                mockFailedFetch(500)

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(1)
            })
        })

        // ─── fan-out ─────────────────────────────────────────────────

        describe('fan-out', () => {
            it('should handle multiple webhooks for same agentflow', async () => {
                const webhook1 = { ...createWebhook(['execution.completed']), id: 'wh-1', maxRetries: 0 }
                const webhook2 = { ...createWebhook(['execution.completed']), id: 'wh-2', maxRetries: 0 }
                mockWebhookRepo.find.mockResolvedValue([webhook1, webhook2])
                mockSuccessfulFetch()

                await dispatchWebhooks(mockDataSource, createExecution('FINISHED'), 'manual')
                await flushDeliveries()

                // Both webhooks should receive a delivery
                expect(mockDeliveryRepo.save).toHaveBeenCalledTimes(2)
                const webhookIds = mockDeliveryRepo.save.mock.calls.map((c: any) => c[0].webhookId)
                expect(webhookIds).toContain('wh-1')
                expect(webhookIds).toContain('wh-2')
            })
        })

        // ─── helpers ─────────────────────────────────────────────────

        function createExecution(state: string) {
            return {
                id: 'exec-1',
                agentflowId: 'flow-1',
                state,
                sessionId: 'session-1',
                executionData: JSON.stringify([]),
                createdDate: new Date('2024-01-01T00:00:00Z'),
                updatedDate: new Date('2024-01-01T00:01:00Z'),
                stoppedDate: new Date('2024-01-01T00:01:00Z')
            }
        }

        function createWebhook(events: string[]) {
            return {
                id: 'webhook-1',
                name: 'Test',
                url: 'https://example.com/webhook',
                agentflowId: 'flow-1',
                events: JSON.stringify(events),
                secret: 'test-secret-key',
                enabled: true,
                maxRetries: 3,
                timeoutMs: 5000
            }
        }

        function mockSuccessfulFetch() {
            const fn = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue('OK')
            })
            global.fetch = fn as any
            return fn
        }

        function mockFailedFetch(status: number) {
            const fn = jest.fn().mockResolvedValue({
                ok: false,
                status,
                text: jest.fn().mockResolvedValue('Error')
            })
            global.fetch = fn as any
            return fn
        }

        /**
         * Wait for fire-and-forget deliverWithRetry promises to settle.
         * The dispatcher launches delivery as a non-blocking `.catch()` chain,
         * so we need to yield the event loop. For retry tests with backoff,
         * we use fake timers.
         */
        async function flushDeliveries(advanceMs?: number) {
            if (advanceMs) {
                // For retry tests: advance through backoff timers
                // Use real timer resolution to let async promises settle
                for (let elapsed = 0; elapsed < advanceMs; elapsed += 200) {
                    await new Promise((r) => setTimeout(r, 10))
                }
            } else {
                // For single-attempt tests: just yield a few ticks
                for (let i = 0; i < 10; i++) {
                    await new Promise((r) => setTimeout(r, 10))
                }
            }
        }
    })
}
