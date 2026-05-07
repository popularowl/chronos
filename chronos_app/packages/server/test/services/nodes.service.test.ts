/**
 * Test suite for Nodes service
 * Tests node retrieval and operations
 */
export function nodesServiceTest() {
    describe('Nodes Service', () => {
        let nodesService: any
        let mockNodesPool: any
        let mockQueueManager: any
        let mockAppServer: any

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create fresh mocks
            mockNodesPool = {
                componentNodes: {
                    chatOpenAI: {
                        name: 'chatOpenAI',
                        label: 'ChatOpenAI',
                        category: 'Chat Models',
                        icon: 'openai.svg',
                        inputs: [{ name: 'modelName', type: 'string' }],
                        loadMethods: {
                            listModels: jest.fn()
                        }
                    },
                    anthropic: {
                        name: 'anthropic',
                        label: 'Anthropic',
                        category: 'Chat Models',
                        icon: 'anthropic.png',
                        inputs: []
                    },
                    customTool: {
                        name: 'customTool',
                        label: 'Custom Tool',
                        category: 'Tools',
                        icon: 'tool.jpg',
                        inputs: []
                    },
                    noIconNode: {
                        name: 'noIconNode',
                        label: 'No Icon Node',
                        category: 'Other'
                    }
                }
            }

            mockQueueManager = {
                getQueue: jest.fn()
            }

            mockAppServer = {
                AppDataSource: {},
                nodesPool: mockNodesPool,
                cachePool: {},
                queueManager: mockQueueManager
            }

            // Setup mocks before importing service
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                databaseEntities: {}
            }))

            const mockLogger = {
                debug: jest.fn(),
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                http: jest.fn(),
                level: 'info'
            }
            jest.doMock('../../src/utils/logger', () => ({
                __esModule: true,
                default: mockLogger,
                expressRequestLogger: jest.fn((req: any, res: any, next: any) => next()),
                createModuleLogger: jest.fn(() => mockLogger)
            }))

            jest.doMock('../../src/utils/executeCustomNodeFunction', () => ({
                executeCustomNodeFunction: jest.fn().mockResolvedValue({ result: 'executed' })
            }))

            // Import service after mocks are set up
            nodesService = require('../../src/services/nodes').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
        })

        describe('getAllNodes', () => {
            it('should return all component nodes', async () => {
                const result = await nodesService.getAllNodes()

                expect(Array.isArray(result)).toBe(true)
                expect(result).toHaveLength(4)
            })

            it('should return cloned nodes (not reference)', async () => {
                const result1 = await nodesService.getAllNodes()
                const result2 = await nodesService.getAllNodes()

                // Modifying one should not affect the other
                ;(result1[0] as any).customProperty = 'test'
                expect((result2[0] as any).customProperty).toBeUndefined()
            })

            it('should include all node properties', async () => {
                const result = await nodesService.getAllNodes()
                const openAINode = result.find((n: any) => n.name === 'chatOpenAI')

                expect(openAINode).toBeDefined()
                expect(openAINode!.label).toBe('ChatOpenAI')
                expect(openAINode!.category).toBe('Chat Models')
                expect(openAINode!.icon).toBe('openai.svg')
            })
        })

        describe('getAllNodesForCategory', () => {
            it('should return nodes for specific category', async () => {
                const result = await nodesService.getAllNodesForCategory('Chat Models')

                expect(Array.isArray(result)).toBe(true)
                expect(result).toHaveLength(2)
                result.forEach((node: any) => {
                    expect(node.category).toBe('Chat Models')
                })
            })

            it('should return empty array for non-existent category', async () => {
                const result = await nodesService.getAllNodesForCategory('Non Existent Category')

                expect(Array.isArray(result)).toBe(true)
                expect(result).toHaveLength(0)
            })

            it('should return tools category nodes', async () => {
                const result = await nodesService.getAllNodesForCategory('Tools')

                expect(result).toHaveLength(1)
                expect(result[0].name).toBe('customTool')
            })

            it('should return cloned nodes', async () => {
                const result1 = await nodesService.getAllNodesForCategory('Chat Models')
                const result2 = await nodesService.getAllNodesForCategory('Chat Models')

                ;(result1[0] as any).customProperty = 'test'
                expect((result2[0] as any).customProperty).toBeUndefined()
            })
        })

        describe('getNodeByName', () => {
            it('should return node by name', async () => {
                const result = await nodesService.getNodeByName('chatOpenAI')

                expect(result).toBeDefined()
                expect(result.name).toBe('chatOpenAI')
                expect(result.label).toBe('ChatOpenAI')
            })

            it('should throw NOT_FOUND for non-existent node', async () => {
                await expect(nodesService.getNodeByName('nonExistentNode')).rejects.toThrow('not found')
            })

            it('should return anthropic node', async () => {
                const result = await nodesService.getNodeByName('anthropic')

                expect(result).toBeDefined()
                expect(result.name).toBe('anthropic')
            })
        })

        describe('getSingleNodeIcon', () => {
            it('should return icon path for svg icon', async () => {
                const result = await nodesService.getSingleNodeIcon('chatOpenAI')

                expect(result).toBe('openai.svg')
            })

            it('should return icon path for png icon', async () => {
                const result = await nodesService.getSingleNodeIcon('anthropic')

                expect(result).toBe('anthropic.png')
            })

            it('should return icon path for jpg icon', async () => {
                const result = await nodesService.getSingleNodeIcon('customTool')

                expect(result).toBe('tool.jpg')
            })

            it('should throw NOT_FOUND for non-existent node', async () => {
                await expect(nodesService.getSingleNodeIcon('nonExistentNode')).rejects.toThrow('not found')
            })

            it('should throw NOT_FOUND for node without icon', async () => {
                await expect(nodesService.getSingleNodeIcon('noIconNode')).rejects.toThrow('icon not found')
            })
        })

        describe('getSingleNodeAsyncOptions', () => {
            it('should call loadMethod and return options', async () => {
                const mockOptions = [
                    { label: 'gpt-4', name: 'gpt-4' },
                    { label: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' }
                ]
                mockNodesPool.componentNodes.chatOpenAI.loadMethods!.listModels.mockResolvedValue(mockOptions)

                const result = await nodesService.getSingleNodeAsyncOptions('chatOpenAI', {
                    loadMethod: 'listModels'
                })

                expect(result).toEqual(mockOptions)
            })

            it('should return empty array on loadMethod error', async () => {
                mockNodesPool.componentNodes.chatOpenAI.loadMethods!.listModels.mockRejectedValue(new Error('API error'))

                const result = await nodesService.getSingleNodeAsyncOptions('chatOpenAI', {
                    loadMethod: 'listModels'
                })

                expect(result).toEqual([])
            })

            it('should throw NOT_FOUND for non-existent node', async () => {
                await expect(nodesService.getSingleNodeAsyncOptions('nonExistentNode', {})).rejects.toThrow('not found')
            })

            it('should pass nodeData and options to loadMethod', async () => {
                mockNodesPool.componentNodes.chatOpenAI.loadMethods!.listModels.mockResolvedValue([])

                const nodeData = {
                    loadMethod: 'listModels',
                    previousNodes: [],
                    currentNode: {},
                    searchOptions: { query: 'test' }
                }

                await nodesService.getSingleNodeAsyncOptions('chatOpenAI', nodeData)

                expect(mockNodesPool.componentNodes.chatOpenAI.loadMethods!.listModels).toHaveBeenCalledWith(
                    nodeData,
                    expect.objectContaining({
                        appDataSource: expect.anything(),
                        componentNodes: expect.anything(),
                        previousNodes: nodeData.previousNodes,
                        currentNode: nodeData.currentNode,
                        searchOptions: nodeData.searchOptions
                    })
                )
            })
        })

        describe('executeCustomFunction', () => {
            it('should execute custom function directly when not in queue mode', async () => {
                const originalMode = process.env.MODE
                process.env.MODE = 'default'

                const requestBody = { code: 'return 1 + 1' }
                const result = await nodesService.executeCustomFunction(requestBody, 'workspace-1', 'org-1')

                expect(result).toEqual({ result: 'executed' })

                process.env.MODE = originalMode
            })

            it('should use queue when MODE is QUEUE', async () => {
                const originalMode = process.env.MODE
                process.env.MODE = 'queue'

                const mockJob = {
                    id: 'job-1',
                    waitUntilFinished: jest.fn().mockResolvedValue({ result: 'queued-result' })
                }
                const mockPredictionQueue = {
                    addJob: jest.fn().mockResolvedValue(mockJob),
                    getQueueEvents: jest.fn().mockReturnValue({})
                }
                mockQueueManager.getQueue.mockReturnValue(mockPredictionQueue)

                const requestBody = { code: 'return 1 + 1' }
                const result = await nodesService.executeCustomFunction(requestBody, 'workspace-1', 'org-1')

                expect(mockQueueManager.getQueue).toHaveBeenCalledWith('prediction')
                expect(mockPredictionQueue.addJob).toHaveBeenCalled()
                expect(result).toEqual({ result: 'queued-result' })

                process.env.MODE = originalMode
            })

            it('should throw error when queue job returns null', async () => {
                const originalMode = process.env.MODE
                process.env.MODE = 'queue'

                const mockJob = {
                    id: 'job-1',
                    waitUntilFinished: jest.fn().mockResolvedValue(null)
                }
                const mockPredictionQueue = {
                    addJob: jest.fn().mockResolvedValue(mockJob),
                    getQueueEvents: jest.fn().mockReturnValue({})
                }
                mockQueueManager.getQueue.mockReturnValue(mockPredictionQueue)

                await expect(nodesService.executeCustomFunction({}, 'workspace-1', 'org-1')).rejects.toThrow(
                    'Failed to execute custom function'
                )

                process.env.MODE = originalMode
            })
        })
    })
}
