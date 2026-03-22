import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for Webhooks service
 * Tests CRUD operations, validation, and feature flag guard
 */
export function webhooksServiceTest() {
    describe('Webhooks Service', () => {
        let webhooksService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        const setupMocks = () => {
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))
            jest.doMock('../../src/utils', () => ({
                getAppVersion: jest.fn().mockResolvedValue('1.0.0')
            }))
        }

        beforeAll(() => {
            jest.resetModules()
            process.env.ENABLE_WEBHOOKS = 'true'

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                telemetry: { sendTelemetry: jest.fn() },
                metricsProvider: { incrementCounter: jest.fn() }
            }

            setupMocks()

            webhooksService = require('../../src/services/webhooks').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
        })

        // ─── createWebhook ───────────────────────────────────────────

        describe('createWebhook', () => {
            it('should create a new webhook with default events', async () => {
                const webhookData = {
                    name: 'Test Webhook',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }
                const savedWebhook = { id: 'webhook-1', ...webhookData, enabled: true }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })
                mockRepository.create.mockReturnValue(savedWebhook)
                mockRepository.save.mockResolvedValue(savedWebhook)

                const result = await webhooksService.createWebhook(webhookData)

                expect(mockRepository.create).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(savedWebhook)
            })

            it('should auto-generate a 64-char hex secret', async () => {
                const webhookData = {
                    name: 'Secret Test',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                const result = await webhooksService.createWebhook(webhookData)

                expect(result.secret).toBeDefined()
                expect(typeof result.secret).toBe('string')
                expect(result.secret.length).toBe(64) // 32 bytes = 64 hex chars
                expect(/^[0-9a-f]{64}$/.test(result.secret)).toBe(true)
            })

            it('should accept explicit valid events array', async () => {
                const webhookData = {
                    name: 'Custom Events',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    events: ['execution.completed', 'execution.timeout']
                }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                const result = await webhooksService.createWebhook(webhookData)

                expect(result.events).toBe(JSON.stringify(['execution.completed', 'execution.timeout']))
            })

            it('should accept events as JSON string', async () => {
                const webhookData = {
                    name: 'String Events',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    events: JSON.stringify(['execution.failed'])
                }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                const result = await webhooksService.createWebhook(webhookData)

                expect(result.events).toBe(JSON.stringify(['execution.failed']))
            })

            it('should respect custom maxRetries and timeoutMs', async () => {
                const webhookData = {
                    name: 'Custom Config',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    maxRetries: 5,
                    timeoutMs: 30000
                }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                const result = await webhooksService.createWebhook(webhookData)

                expect(result.maxRetries).toBe(5)
                expect(result.timeoutMs).toBe(30000)
            })

            it('should throw error when name is missing', async () => {
                const webhookData = {
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('name is required')
            })

            it('should throw error when url is missing', async () => {
                const webhookData = {
                    name: 'Test',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('url is required')
            })

            it('should throw error when agentflowId is missing', async () => {
                const webhookData = {
                    name: 'Test',
                    url: 'https://example.com/webhook'
                }

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('agentflowId is required')
            })

            it('should throw error for invalid URL', async () => {
                const webhookData = {
                    name: 'Test',
                    url: 'not-a-url',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('valid HTTP or HTTPS URL')
            })

            it('should reject ftp:// URL', async () => {
                const webhookData = {
                    name: 'Test',
                    url: 'ftp://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('valid HTTP or HTTPS URL')
            })

            it('should throw error when agentflow does not exist', async () => {
                const webhookData = {
                    name: 'Test',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('not found')
            })

            it('should throw error for invalid event', async () => {
                const webhookData = {
                    name: 'Test',
                    url: 'https://example.com/webhook',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    events: ['invalid.event']
                }

                mockRepository.findOneBy.mockResolvedValue({ id: webhookData.agentflowId })

                await expect(webhooksService.createWebhook(webhookData)).rejects.toThrow('Invalid event')
            })
        })

        // ─── deleteWebhook ───────────────────────────────────────────

        describe('deleteWebhook', () => {
            it('should delete webhook and associated deliveries', async () => {
                const webhook = { id: 'webhook-1', name: 'Test' }
                mockRepository.findOneBy.mockResolvedValue(webhook)
                mockRepository.delete.mockResolvedValue({ affected: 1 })

                await webhooksService.deleteWebhook('webhook-1')

                // First call deletes deliveries, second deletes webhook
                expect(mockRepository.delete).toHaveBeenCalledWith({ webhookId: 'webhook-1' })
                expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'webhook-1' })
            })

            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.deleteWebhook('non-existent')).rejects.toThrow('not found')
            })
        })

        // ─── getAllWebhooks ──────────────────────────────────────────

        describe('getAllWebhooks', () => {
            it('should return all webhooks without pagination', async () => {
                const mockWebhooks = [
                    { id: '1', name: 'Webhook 1' },
                    { id: '2', name: 'Webhook 2' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockWebhooks, 2])

                const result = await webhooksService.getAllWebhooks()

                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('webhook')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('webhook.updatedDate', 'DESC')
                expect(result).toEqual(mockWebhooks)
            })

            it('should return paginated results', async () => {
                const mockWebhooks = [{ id: '1', name: 'Webhook 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockWebhooks, 10])

                const result = await webhooksService.getAllWebhooks(2, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ data: mockWebhooks, total: 10 })
            })

            it('should filter by agentflowId', async () => {
                const mockWebhooks = [{ id: '1', name: 'Webhook 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockWebhooks, 1])

                await webhooksService.getAllWebhooks(-1, -1, 'flow-1')

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('webhook.agentflowId = :agentflowId', { agentflowId: 'flow-1' })
            })
        })

        // ─── getWebhookById ─────────────────────────────────────────

        describe('getWebhookById', () => {
            it('should return webhook by ID', async () => {
                const mockWebhook = { id: 'webhook-1', name: 'Test Webhook' }
                mockRepository.findOneBy.mockResolvedValue(mockWebhook)

                const result = await webhooksService.getWebhookById('webhook-1')

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'webhook-1' })
                expect(result).toEqual(mockWebhook)
            })

            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.getWebhookById('non-existent')).rejects.toThrow('not found')
            })
        })

        // ─── updateWebhook ──────────────────────────────────────────

        describe('updateWebhook', () => {
            it('should update existing webhook', async () => {
                const existingWebhook = { id: 'webhook-1', name: 'Old', url: 'https://example.com/old', enabled: true }
                const updatedWebhook = { id: 'webhook-1', name: 'New', url: 'https://example.com/old', enabled: true }

                mockRepository.findOneBy.mockResolvedValue(existingWebhook)
                mockRepository.save.mockResolvedValue(updatedWebhook)

                const result = await webhooksService.updateWebhook('webhook-1', { name: 'New' })

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'webhook-1' })
                expect(mockRepository.merge).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(updatedWebhook)
            })

            it('should not overwrite secret via update', async () => {
                const existingWebhook = { id: 'webhook-1', name: 'Old', secret: 'original-secret' }
                mockRepository.findOneBy.mockResolvedValue(existingWebhook)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                await webhooksService.updateWebhook('webhook-1', { name: 'New', secret: 'hacked-secret' })

                // merge is called with an object that should NOT have secret
                const mergeCall = mockRepository.merge.mock.calls[0]
                const mergedSource = mergeCall[1]
                expect(mergedSource.secret).toBeUndefined()
            })

            it('should validate events if provided on update', async () => {
                const existingWebhook = { id: 'webhook-1', name: 'Old' }
                mockRepository.findOneBy.mockResolvedValue(existingWebhook)

                await expect(webhooksService.updateWebhook('webhook-1', { events: ['bogus.event'] })).rejects.toThrow('Invalid event')
            })

            it('should accept valid event change on update', async () => {
                const existingWebhook = { id: 'webhook-1', name: 'Old', events: '["execution.completed"]' }
                mockRepository.findOneBy.mockResolvedValue(existingWebhook)
                mockRepository.save.mockImplementation((entity: any) => Promise.resolve(entity))

                await webhooksService.updateWebhook('webhook-1', { events: ['execution.failed', 'execution.timeout'] })

                const mergeCall = mockRepository.merge.mock.calls[0]
                const mergedSource = mergeCall[1]
                expect(mergedSource.events).toBe(JSON.stringify(['execution.failed', 'execution.timeout']))
            })

            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.updateWebhook('non-existent', { name: 'Updated' })).rejects.toThrow('not found')
            })

            it('should reject invalid URL on update', async () => {
                const existingWebhook = { id: 'webhook-1', name: 'Old', url: 'https://example.com/old' }
                mockRepository.findOneBy.mockResolvedValue(existingWebhook)

                await expect(webhooksService.updateWebhook('webhook-1', { url: 'not-a-url' })).rejects.toThrow('valid HTTP or HTTPS URL')
            })
        })

        // ─── toggleWebhook ──────────────────────────────────────────

        describe('toggleWebhook', () => {
            it('should toggle webhook enabled state', async () => {
                const webhook = { id: 'webhook-1', name: 'Test', enabled: true }
                const toggled = { ...webhook, enabled: false }

                mockRepository.findOneBy.mockResolvedValue(webhook)
                mockRepository.save.mockResolvedValue(toggled)

                const result = await webhooksService.toggleWebhook('webhook-1', false)

                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(toggled)
            })

            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.toggleWebhook('non-existent', false)).rejects.toThrow('not found')
            })
        })

        // ─── regenerateSecret ────────────────────────────────────────

        describe('regenerateSecret', () => {
            it('should regenerate webhook secret', async () => {
                const webhook = { id: 'webhook-1', secret: 'old-secret' }
                mockRepository.findOneBy.mockResolvedValue(webhook)
                mockRepository.save.mockImplementation((w: any) => Promise.resolve(w))

                const result = await webhooksService.regenerateSecret('webhook-1')

                expect(result.secret).toBeDefined()
                expect(result.secret).not.toBe('old-secret')
                expect(result.secret.length).toBe(64) // 32 bytes = 64 hex chars
            })

            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.regenerateSecret('non-existent')).rejects.toThrow('not found')
            })
        })

        // ─── getWebhookDeliveries ────────────────────────────────────

        describe('getWebhookDeliveries', () => {
            it('should return deliveries for a webhook', async () => {
                const mockDeliveries = [{ id: 'delivery-1', webhookId: 'webhook-1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockDeliveries, 1])

                const result = await webhooksService.getWebhookDeliveries('webhook-1')

                expect(mockQueryBuilder.where).toHaveBeenCalledWith('delivery.webhookId = :webhookId', { webhookId: 'webhook-1' })
                expect(result).toEqual(mockDeliveries)
            })

            it('should return paginated delivery results', async () => {
                const mockDeliveries = [{ id: 'delivery-1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockDeliveries, 10])

                const result = await webhooksService.getWebhookDeliveries('webhook-1', 1, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ data: mockDeliveries, total: 10 })
            })
        })

        // ─── testWebhook ─────────────────────────────────────────────

        describe('testWebhook', () => {
            it('should throw NOT_FOUND for non-existent webhook', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(webhooksService.testWebhook('non-existent')).rejects.toThrow('not found')
            })

            it('should return success result when fetch succeeds', async () => {
                const webhook = {
                    id: 'webhook-1',
                    agentflowId: 'flow-1',
                    url: 'https://example.com/webhook',
                    secret: 'test-secret',
                    timeoutMs: 5000
                }
                mockRepository.findOneBy.mockResolvedValue(webhook)

                const originalFetch = global.fetch
                global.fetch = jest.fn().mockResolvedValue({
                    ok: true,
                    status: 200
                }) as any

                try {
                    const result = await webhooksService.testWebhook('webhook-1')

                    expect(result.success).toBe(true)
                    expect(result.statusCode).toBe(200)
                    expect(result.message).toContain('successfully')
                } finally {
                    global.fetch = originalFetch
                }
            })

            it('should return failure result when fetch returns non-ok', async () => {
                const webhook = {
                    id: 'webhook-1',
                    agentflowId: 'flow-1',
                    url: 'https://example.com/webhook',
                    secret: null,
                    timeoutMs: 5000
                }
                mockRepository.findOneBy.mockResolvedValue(webhook)

                const originalFetch = global.fetch
                global.fetch = jest.fn().mockResolvedValue({
                    ok: false,
                    status: 500
                }) as any

                try {
                    const result = await webhooksService.testWebhook('webhook-1')

                    expect(result.success).toBe(false)
                    expect(result.statusCode).toBe(500)
                } finally {
                    global.fetch = originalFetch
                }
            })

            it('should return failure result when fetch throws', async () => {
                const webhook = {
                    id: 'webhook-1',
                    agentflowId: 'flow-1',
                    url: 'https://example.com/webhook',
                    secret: null,
                    timeoutMs: 5000
                }
                mockRepository.findOneBy.mockResolvedValue(webhook)

                const originalFetch = global.fetch
                global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any

                try {
                    const result = await webhooksService.testWebhook('webhook-1')

                    expect(result.success).toBe(false)
                    expect(result.statusCode).toBeNull()
                    expect(result.message).toContain('Network error')
                } finally {
                    global.fetch = originalFetch
                }
            })
        })

        // ─── feature flag guards ─────────────────────────────────────

        describe('feature flag guards', () => {
            // isWebhooksEnabled reads process.env live, so we toggle it around each call
            let savedEnv: string | undefined

            beforeEach(() => {
                savedEnv = process.env.ENABLE_WEBHOOKS
                process.env.ENABLE_WEBHOOKS = 'false'
            })

            afterEach(() => {
                process.env.ENABLE_WEBHOOKS = savedEnv
            })

            it('should reject createWebhook when disabled', async () => {
                await expect(webhooksService.createWebhook({ name: 'Test', url: 'https://example.com', agentflowId: 'x' })).rejects.toThrow(
                    'not enabled'
                )
            })

            it('should reject deleteWebhook when disabled', async () => {
                await expect(webhooksService.deleteWebhook('webhook-1')).rejects.toThrow('not enabled')
            })

            it('should reject updateWebhook when disabled', async () => {
                await expect(webhooksService.updateWebhook('webhook-1', { name: 'New' })).rejects.toThrow('not enabled')
            })

            it('should reject toggleWebhook when disabled', async () => {
                await expect(webhooksService.toggleWebhook('webhook-1', false)).rejects.toThrow('not enabled')
            })

            it('should reject regenerateSecret when disabled', async () => {
                await expect(webhooksService.regenerateSecret('webhook-1')).rejects.toThrow('not enabled')
            })

            it('should reject testWebhook when disabled', async () => {
                await expect(webhooksService.testWebhook('webhook-1')).rejects.toThrow('not enabled')
            })
        })
    })
}
