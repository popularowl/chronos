import { createMockRepository, createMockTelemetry } from '../mocks/appServer.mock'

/**
 * Test suite for DocumentStore service - testConnection
 * Tests connection verification for embeddings, vector store, and record manager components
 */
export function documentstoreServiceTest() {
    describe('DocumentStore Service - testConnection', () => {
        let documentStoreService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockTelemetry: ReturnType<typeof createMockTelemetry>
        let mockAppServer: any
        let mockComponentNodes: Record<string, any>

        beforeAll(() => {
            jest.resetModules()

            mockRepository = createMockRepository()
            mockTelemetry = createMockTelemetry()

            // Mock embedding component node that returns a working embeddings object
            const mockEmbeddingNode = {
                name: 'testEmbedding',
                label: 'Test Embedding',
                category: 'Embeddings',
                inputs: [],
                filePath: '/mock/embedding/path'
            }

            // Mock vector store component node
            const mockVectorStoreNode = {
                name: 'testVectorStore',
                label: 'Test Vector Store',
                category: 'Vector Stores',
                inputs: [
                    { name: 'qdrantServerUrl', type: 'string' },
                    { name: 'embeddings', type: 'Embeddings' }
                ],
                filePath: '/mock/vectorstore/path'
            }

            // Mock record manager component node
            const mockRecordManagerNode = {
                name: 'testRecordManager',
                label: 'Test Record Manager',
                category: 'Record Manager',
                inputs: [],
                filePath: '/mock/recordmanager/path'
            }

            mockComponentNodes = {
                testEmbedding: mockEmbeddingNode,
                testVectorStore: mockVectorStoreNode,
                testRecordManager: mockRecordManagerNode
            }

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                telemetry: mockTelemetry,
                nodesPool: {
                    componentNodes: mockComponentNodes
                }
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                databaseEntities: {},
                getAppVersion: jest.fn().mockResolvedValue('1.0.0'),
                saveUpsertFlowData: jest.fn()
            }))

            jest.doMock('../../src/utils/logger', () => ({
                default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
                createModuleLogger: jest.fn(() => ({
                    info: jest.fn(),
                    error: jest.fn(),
                    warn: jest.fn(),
                    debug: jest.fn(),
                    verbose: jest.fn()
                }))
            }))

            // Mock the dynamic imports for component nodes
            // Embedding: init returns an object with embedQuery
            jest.doMock(
                '/mock/embedding/path',
                () => ({
                    nodeClass: class {
                        async init() {
                            return {
                                embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4])
                            }
                        }
                    }
                }),
                { virtual: true }
            )

            // Record manager: init returns an object (successful connection)
            jest.doMock(
                '/mock/recordmanager/path',
                () => ({
                    nodeClass: class {
                        async init() {
                            return {
                                end: jest.fn().mockResolvedValue(undefined)
                            }
                        }
                    }
                }),
                { virtual: true }
            )

            // Vector store: init returns an object
            jest.doMock(
                '/mock/vectorstore/path',
                () => ({
                    nodeClass: class {
                        async init() {
                            return {}
                        }
                    }
                }),
                { virtual: true }
            )

            documentStoreService = require('../../src/services/documentstore').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
        })

        describe('testConnection - embeddings', () => {
            it('should return success for a working embeddings provider', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'embeddings',
                    componentName: 'testEmbedding',
                    componentConfig: { baseUrl: 'http://localhost:11434' }
                })

                expect(result.success).toBe(true)
                expect(result.message).toContain('Successfully connected')
                expect(result.details).toContain('Embedding dimension: 4')
                expect(typeof result.latencyMs).toBe('number')
                expect(result.latencyMs).toBeGreaterThanOrEqual(0)
            })

            it('should return failure for a non-existent component', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'embeddings',
                    componentName: 'nonExistentComponent',
                    componentConfig: { baseUrl: 'http://localhost:11434' }
                })

                expect(result.success).toBe(false)
                expect(result.message).toContain('Connection failed')
                expect(typeof result.latencyMs).toBe('number')
            })
        })

        describe('testConnection - vectorStore', () => {
            it('should return failure for a non-existent vector store component', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'vectorStore',
                    componentName: 'nonExistentVectorStore',
                    componentConfig: { url: 'http://localhost:6333' }
                })

                expect(result.success).toBe(false)
                expect(result.message).toContain('Connection failed')
                expect(typeof result.latencyMs).toBe('number')
            })

            it('should attempt connection for a known vector store with URL config', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'vectorStore',
                    componentName: 'testVectorStore',
                    componentConfig: { qdrantServerUrl: 'http://localhost:6333' }
                })

                // Will fail because localhost:6333 is not running, but should return a graceful failure
                expect(result).toHaveProperty('success')
                expect(result).toHaveProperty('message')
                expect(typeof result.latencyMs).toBe('number')
            })
        })

        describe('testConnection - recordManager', () => {
            it('should return success for a working record manager', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'recordManager',
                    componentName: 'testRecordManager',
                    componentConfig: { host: 'localhost', port: 5432 }
                })

                expect(result.success).toBe(true)
                expect(result.message).toContain('Successfully connected')
                expect(typeof result.latencyMs).toBe('number')
                expect(result.latencyMs).toBeGreaterThanOrEqual(0)
            })

            it('should return failure for a non-existent record manager', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'recordManager',
                    componentName: 'nonExistentRecordManager',
                    componentConfig: { host: 'localhost' }
                })

                expect(result.success).toBe(false)
                expect(result.message).toContain('Connection failed')
                expect(typeof result.latencyMs).toBe('number')
            })
        })

        describe('testConnection - invalid type', () => {
            it('should return failure for an unknown component type', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'unknownType',
                    componentName: 'testComponent',
                    componentConfig: {}
                })

                expect(result.success).toBe(false)
                expect(result.message).toContain('Connection failed')
                expect(result.message).toContain('Unknown component type')
                expect(typeof result.latencyMs).toBe('number')
            })
        })

        describe('testConnection - response shape', () => {
            it('should always return success, message, and latencyMs fields', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'embeddings',
                    componentName: 'testEmbedding',
                    componentConfig: {}
                })

                expect(result).toHaveProperty('success')
                expect(result).toHaveProperty('message')
                expect(result).toHaveProperty('latencyMs')
                expect(typeof result.success).toBe('boolean')
                expect(typeof result.message).toBe('string')
                expect(typeof result.latencyMs).toBe('number')
            })

            it('should include details field on successful embeddings test', async () => {
                const result = await documentStoreService.testConnection({
                    componentType: 'embeddings',
                    componentName: 'testEmbedding',
                    componentConfig: { baseUrl: 'http://localhost:11434' }
                })

                expect(result.success).toBe(true)
                expect(result).toHaveProperty('details')
                expect(typeof result.details).toBe('string')
            })
        })
    })
}
