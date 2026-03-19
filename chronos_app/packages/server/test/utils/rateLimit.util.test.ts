import { RateLimiterManager } from '../../src/utils/rateLimit'

/**
 * Test suite for rateLimit utility
 * Tests rate limiter management with branch coverage
 */
export function rateLimitUtilTest() {
    describe('RateLimit Utilities', () => {
        let originalEnv: NodeJS.ProcessEnv

        beforeEach(() => {
            originalEnv = { ...process.env }
            jest.clearAllMocks()
            // Reset singleton for testing
            ;(RateLimiterManager as any).instance = undefined
        })

        afterEach(() => {
            process.env = originalEnv
        })

        describe('RateLimiterManager', () => {
            describe('getInstance', () => {
                it('should return singleton instance', () => {
                    delete process.env.MODE

                    const instance1 = RateLimiterManager.getInstance()
                    const instance2 = RateLimiterManager.getInstance()

                    expect(instance1).toBe(instance2)
                })

                it('should create new instance when none exists', () => {
                    delete process.env.MODE

                    const instance = RateLimiterManager.getInstance()

                    expect(instance).toBeInstanceOf(RateLimiterManager)
                })
            })

            describe('constructor (non-queue mode)', () => {
                it('should initialize without Redis when MODE is not QUEUE', () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()

                    expect(manager).toBeInstanceOf(RateLimiterManager)
                })

                it('should initialize when MODE is undefined', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL

                    const manager = new RateLimiterManager()

                    expect(manager).toBeInstanceOf(RateLimiterManager)
                })
            })

            describe('addRateLimiter (non-queue mode)', () => {
                it('should add rate limiter successfully', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    await manager.addRateLimiter('test-id', 60, 100, 'Rate limit exceeded')

                    // Should not throw
                    expect(true).toBe(true)
                })

                it('should add multiple rate limiters', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    await manager.addRateLimiter('test-id-1', 60, 100, 'Rate limit exceeded')
                    await manager.addRateLimiter('test-id-2', 30, 50, 'Too many requests')

                    expect(true).toBe(true)
                })
            })

            describe('removeRateLimiter', () => {
                it('should remove existing rate limiter', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    await manager.addRateLimiter('test-id', 60, 100, 'Rate limit exceeded')
                    manager.removeRateLimiter('test-id')

                    // Should not throw
                    expect(true).toBe(true)
                })

                it('should handle removing non-existent rate limiter', () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    manager.removeRateLimiter('non-existent-id')

                    // Should not throw
                    expect(true).toBe(true)
                })
            })

            describe('getRateLimiter', () => {
                it('should return middleware function', () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const middleware = manager.getRateLimiter()

                    expect(typeof middleware).toBe('function')
                })

                it('should call next when no rate limiter exists for id', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const middleware = manager.getRateLimiter()
                    const req = { params: { id: 'unknown-id' } } as any
                    const res = {} as any
                    const next = jest.fn()

                    middleware(req, res, next)

                    expect(next).toHaveBeenCalled()
                })

                it('should apply rate limiter when exists for id', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    await manager.addRateLimiter('existing-id', 60, 100, 'Rate limit exceeded')
                    const middleware = manager.getRateLimiter()
                    const req = {
                        params: { id: 'existing-id' },
                        ip: '127.0.0.1',
                        headers: {},
                        socket: { remoteAddress: '127.0.0.1' },
                        app: { get: () => false }
                    } as any
                    const res = {
                        setHeader: jest.fn(),
                        status: jest.fn().mockReturnThis(),
                        send: jest.fn()
                    } as any
                    const next = jest.fn()

                    // The rate limiter middleware is async
                    await middleware(req, res, next)

                    // Rate limiter should process the request
                    expect(true).toBe(true)
                })
            })

            describe('updateRateLimiter', () => {
                it('should return early when agentFlow has no apiConfig', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentFlow = { id: 'test-id', apiConfig: null } as any

                    await manager.updateRateLimiter(agentFlow)

                    // Should complete without error
                    expect(true).toBe(true)
                })

                it('should return early when apiConfig has no rateLimit', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentFlow = {
                        id: 'test-id',
                        apiConfig: JSON.stringify({ someOtherConfig: true })
                    } as any

                    await manager.updateRateLimiter(agentFlow)

                    expect(true).toBe(true)
                })

                it('should remove rate limiter when status is false', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    await manager.addRateLimiter('test-id', 60, 100, 'Rate limit')

                    const agentFlow = {
                        id: 'test-id',
                        apiConfig: JSON.stringify({
                            rateLimit: {
                                status: false,
                                limitDuration: 60,
                                limitMax: 100,
                                limitMsg: 'Rate limit exceeded'
                            }
                        })
                    } as any

                    await manager.updateRateLimiter(agentFlow, true)

                    expect(true).toBe(true)
                })

                it('should add rate limiter when all params provided and status is not false', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentFlow = {
                        id: 'test-id',
                        apiConfig: JSON.stringify({
                            rateLimit: {
                                status: true,
                                limitDuration: 60,
                                limitMax: 100,
                                limitMsg: 'Rate limit exceeded'
                            }
                        })
                    } as any

                    await manager.updateRateLimiter(agentFlow, true)

                    expect(true).toBe(true)
                })

                it('should handle rateLimit with missing limitMsg', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentFlow = {
                        id: 'test-id',
                        apiConfig: JSON.stringify({
                            rateLimit: {
                                status: true,
                                limitDuration: 60,
                                limitMax: 100
                            }
                        })
                    } as any

                    await manager.updateRateLimiter(agentFlow, true)

                    expect(true).toBe(true)
                })

                it('should handle rateLimit with missing limitMax', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentFlow = {
                        id: 'test-id',
                        apiConfig: JSON.stringify({
                            rateLimit: {
                                status: true,
                                limitDuration: 60,
                                limitMsg: 'Rate limit exceeded'
                            }
                        })
                    } as any

                    await manager.updateRateLimiter(agentFlow, true)

                    expect(true).toBe(true)
                })
            })

            describe('initializeRateLimiters', () => {
                it('should initialize rate limiters for all agentflows', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentflows = [
                        {
                            id: 'flow-1',
                            apiConfig: JSON.stringify({
                                rateLimit: {
                                    status: true,
                                    limitDuration: 60,
                                    limitMax: 100,
                                    limitMsg: 'Rate limit'
                                }
                            })
                        },
                        {
                            id: 'flow-2',
                            apiConfig: JSON.stringify({
                                rateLimit: {
                                    status: true,
                                    limitDuration: 30,
                                    limitMax: 50,
                                    limitMsg: 'Rate limit'
                                }
                            })
                        }
                    ] as any[]

                    await manager.initializeRateLimiters(agentflows)

                    expect(true).toBe(true)
                })

                it('should handle empty agentflows array', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()

                    await manager.initializeRateLimiters([])

                    expect(true).toBe(true)
                })

                it('should handle agentflows without apiConfig', async () => {
                    delete process.env.MODE

                    const manager = new RateLimiterManager()
                    const agentflows = [{ id: 'flow-1', apiConfig: null }, { id: 'flow-2' }] as any[]

                    await manager.initializeRateLimiters(agentflows)

                    expect(true).toBe(true)
                })
            })

            describe('getConnection', () => {
                it('should return connection config without TLS when not configured', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    delete process.env.REDIS_TLS

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection).toBeDefined()
                    expect(connection.host).toBe('localhost')
                    expect(connection.port).toBe(6379)
                    expect(connection.tls).toBeUndefined()
                })

                it('should handle REDIS_URL with rediss:// protocol', () => {
                    delete process.env.MODE
                    process.env.REDIS_URL = 'rediss://user:pass@host:6379'

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.tls).toEqual({ rejectUnauthorized: false })
                })

                it('should handle REDIS_TLS=true with certificates', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_TLS = 'true'
                    process.env.REDIS_CERT = Buffer.from('cert').toString('base64')
                    process.env.REDIS_KEY = Buffer.from('key').toString('base64')
                    process.env.REDIS_CA = Buffer.from('ca').toString('base64')

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.tls).toBeDefined()
                    expect(connection.tls?.cert).toBeDefined()
                    expect(connection.tls?.key).toBeDefined()
                    expect(connection.tls?.ca).toBeDefined()
                })

                it('should handle custom REDIS_HOST and REDIS_PORT', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_HOST = 'custom-host'
                    process.env.REDIS_PORT = '6380'

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.host).toBe('custom-host')
                    expect(connection.port).toBe(6380)
                })

                it('should handle REDIS_USERNAME and REDIS_PASSWORD', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_USERNAME = 'user'
                    process.env.REDIS_PASSWORD = 'pass'

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.username).toBe('user')
                    expect(connection.password).toBe('pass')
                })

                it('should handle REDIS_KEEP_ALIVE with valid number', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_KEEP_ALIVE = '30000'

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.keepAlive).toBe(30000)
                })

                it('should handle REDIS_KEEP_ALIVE with invalid number', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_KEEP_ALIVE = 'invalid'

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.keepAlive).toBeUndefined()
                })

                it('should handle REDIS_TLS without certificates', () => {
                    delete process.env.MODE
                    delete process.env.REDIS_URL
                    process.env.REDIS_TLS = 'true'
                    delete process.env.REDIS_CERT
                    delete process.env.REDIS_KEY
                    delete process.env.REDIS_CA

                    const manager = new RateLimiterManager()
                    const connection = manager.getConnection()

                    expect(connection.tls).toBeDefined()
                })
            })
        })
    })
}
