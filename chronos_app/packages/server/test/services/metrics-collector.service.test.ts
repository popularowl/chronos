/**
 * Test suite for MetricsCollector service
 * Tests metric extraction from execution data, cost calculation, and pricing index
 */
export function metricsCollectorServiceTest() {
    describe('MetricsCollector Service', () => {
        let metricsCollector: any
        let mockRepository: any
        let mockDataSource: any

        beforeAll(() => {
            jest.resetModules()

            mockRepository = {
                save: jest.fn().mockResolvedValue({}),
                find: jest.fn(),
                findOne: jest.fn()
            }

            mockDataSource = {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            }

            jest.doMock('../../src/utils/logger', () => ({
                __esModule: true,
                default: {
                    info: jest.fn(),
                    warn: jest.fn(),
                    error: jest.fn(),
                    debug: jest.fn()
                },
                createModuleLogger: jest.fn(() => ({
                    info: jest.fn(),
                    warn: jest.fn(),
                    error: jest.fn(),
                    debug: jest.fn(),
                    verbose: jest.fn()
                }))
            }))

            metricsCollector = require('../../src/services/metrics-collector')
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockDataSource.getRepository.mockReturnValue(mockRepository)
            metricsCollector.resetPricingIndex()
        })

        describe('collectExecutionMetrics', () => {
            it('should collect metrics from a FINISHED execution with usageMetadata', async () => {
                const execution = createMockExecution('FINISHED', [
                    createLLMNode('node-1', 'LLM', { input_tokens: 100, output_tokens: 50, total_tokens: 150 })
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution, 'manual')

                expect(mockRepository.save).toHaveBeenCalledTimes(1)
                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.totalTokens).toBe(150)
                expect(saved.inputTokens).toBe(100)
                expect(saved.outputTokens).toBe(50)
                expect(saved.state).toBe('FINISHED')
                expect(saved.triggerType).toBe('manual')
            })

            it('should collect metrics from an ERROR execution', async () => {
                const execution = createMockExecution('ERROR', [
                    createLLMNode('node-1', 'LLM', { input_tokens: 50, output_tokens: 20, total_tokens: 70 })
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution, 'api')

                expect(mockRepository.save).toHaveBeenCalledTimes(1)
                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.state).toBe('ERROR')
                expect(saved.triggerType).toBe('api')
                expect(saved.totalTokens).toBe(70)
            })

            it('should skip non-terminal states', async () => {
                const execution = createMockExecution('INPROGRESS', [])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                expect(mockRepository.save).not.toHaveBeenCalled()
            })

            it('should skip executions with missing id', async () => {
                const execution = { agentflowId: 'flow-1', state: 'FINISHED', executionData: '[]' }

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution as any)

                expect(mockRepository.save).not.toHaveBeenCalled()
            })

            it('should skip executions with missing agentflowId', async () => {
                const execution = { id: 'exec-1', state: 'FINISHED', executionData: '[]' }

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution as any)

                expect(mockRepository.save).not.toHaveBeenCalled()
            })

            it('should handle execution with no LLM nodes', async () => {
                const execution = createMockExecution('FINISHED', [
                    { nodeLabel: 'Start', nodeId: 'start-1', data: { output: { content: 'hello' } }, previousNodeIds: [] }
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                expect(mockRepository.save).toHaveBeenCalledTimes(1)
                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.totalTokens).toBe(0)
                expect(saved.inputTokens).toBe(0)
                expect(saved.outputTokens).toBe(0)
                expect(saved.llmCallCount).toBe(0)
                expect(saved.estimatedCostUsd).toBe(0)
            })

            it('should sum tokens across multiple LLM nodes', async () => {
                const execution = createMockExecution('FINISHED', [
                    createLLMNode('node-1', 'LLM-1', { input_tokens: 100, output_tokens: 50, total_tokens: 150 }),
                    createLLMNode('node-2', 'LLM-2', { input_tokens: 200, output_tokens: 100, total_tokens: 300 })
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.totalTokens).toBe(450)
                expect(saved.inputTokens).toBe(300)
                expect(saved.outputTokens).toBe(150)
                expect(saved.llmCallCount).toBe(2)
                expect(saved.nodeCount).toBe(2)
            })

            it('should handle execution with empty executionData', async () => {
                const execution = createMockExecution('FINISHED', [])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                expect(mockRepository.save).toHaveBeenCalledTimes(1)
                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.totalTokens).toBe(0)
                expect(saved.nodeCount).toBe(0)
            })

            it('should handle malformed executionData gracefully', async () => {
                const execution = {
                    id: 'exec-1',
                    agentflowId: 'flow-1',
                    state: 'FINISHED',
                    executionData: 'not-valid-json',
                    createdDate: new Date(),
                    updatedDate: new Date()
                }

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                // Should not throw, should not save
                expect(mockRepository.save).not.toHaveBeenCalled()
            })

            it('should set hasPricing to false when model name not found in pricing', async () => {
                const execution = createMockExecution('FINISHED', [
                    createLLMNode('node-1', 'LLM', { input_tokens: 100, output_tokens: 50, total_tokens: 150 }, 'unknown-model-xyz')
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.hasPricing).toBe(false)
                expect(saved.estimatedCostUsd).toBe(0)
            })

            it('should set hasPricing to false when no model name is available', async () => {
                const execution = createMockExecution('FINISHED', [
                    {
                        nodeLabel: 'LLM',
                        nodeId: 'node-1',
                        data: { output: { usageMetadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
                        previousNodeIds: []
                    }
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.hasPricing).toBe(false)
            })

            it('should calculate duration from createdDate and updatedDate', async () => {
                const created = new Date('2026-03-21T10:00:00Z')
                const updated = new Date('2026-03-21T10:00:05Z')
                const execution = createMockExecution('FINISHED', [], created, updated)

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.durationMs).toBe(5000)
            })

            it('should prefer stoppedDate over updatedDate for duration', async () => {
                const created = new Date('2026-03-21T10:00:00Z')
                const updated = new Date('2026-03-21T10:00:10Z')
                const stopped = new Date('2026-03-21T10:00:03Z')
                const execution = {
                    ...createMockExecution('STOPPED', [], created, updated),
                    stoppedDate: stopped
                }

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.durationMs).toBe(3000)
            })

            it('should build model breakdown JSON with per-model stats', async () => {
                const execution = createMockExecution('FINISHED', [
                    createLLMNode('node-1', 'LLM-1', { input_tokens: 100, output_tokens: 50, total_tokens: 150 }, 'model-a'),
                    createLLMNode('node-2', 'LLM-2', { input_tokens: 200, output_tokens: 100, total_tokens: 300 }, 'model-a'),
                    createLLMNode('node-3', 'LLM-3', { input_tokens: 50, output_tokens: 25, total_tokens: 75 }, 'model-b')
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                const breakdown = JSON.parse(saved.modelBreakdown)
                expect(breakdown['model-a'].inputTokens).toBe(300)
                expect(breakdown['model-a'].outputTokens).toBe(150)
                expect(breakdown['model-b'].inputTokens).toBe(50)
                expect(breakdown['model-b'].outputTokens).toBe(25)
            })

            it('should set modelBreakdown to null when no models found', async () => {
                const execution = createMockExecution('FINISHED', [
                    { nodeLabel: 'Condition', nodeId: 'cond-1', data: { output: { result: true } }, previousNodeIds: [] }
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                expect(saved.modelBreakdown).toBeNull()
            })

            it('should handle all terminal states', async () => {
                const terminalStates = ['FINISHED', 'ERROR', 'TIMEOUT', 'TERMINATED', 'STOPPED']

                for (const state of terminalStates) {
                    jest.clearAllMocks()
                    const execution = createMockExecution(state, [])
                    await metricsCollector.collectExecutionMetrics(mockDataSource, execution)
                    expect(mockRepository.save).toHaveBeenCalledTimes(1)
                    expect(mockRepository.save.mock.calls[0][0].state).toBe(state)
                }
            })

            it('should not throw on save failure', async () => {
                mockRepository.save.mockRejectedValue(new Error('DB error'))
                const execution = createMockExecution('FINISHED', [])

                // Should not throw
                await expect(metricsCollector.collectExecutionMetrics(mockDataSource, execution)).resolves.toBeUndefined()
            })
        })

        describe('extractModelName', () => {
            it('should extract model from responseMetadata.model', async () => {
                const execution = createMockExecution('FINISHED', [
                    {
                        nodeLabel: 'LLM',
                        nodeId: 'n1',
                        data: {
                            output: {
                                usageMetadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                                responseMetadata: { model: 'gpt-4o' }
                            }
                        },
                        previousNodeIds: []
                    }
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                const breakdown = JSON.parse(saved.modelBreakdown)
                expect(breakdown).toHaveProperty('gpt-4o')
            })

            it('should extract model from responseMetadata.model_name', async () => {
                const execution = createMockExecution('FINISHED', [
                    {
                        nodeLabel: 'LLM',
                        nodeId: 'n1',
                        data: {
                            output: {
                                usageMetadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                                responseMetadata: { model_name: 'claude-sonnet' }
                            }
                        },
                        previousNodeIds: []
                    }
                ])

                await metricsCollector.collectExecutionMetrics(mockDataSource, execution)

                const saved = mockRepository.save.mock.calls[0][0]
                const breakdown = JSON.parse(saved.modelBreakdown)
                expect(breakdown).toHaveProperty('claude-sonnet')
            })
        })

        describe('getPricingCurrency', () => {
            it('should return USD as default currency', () => {
                expect(metricsCollector.getPricingCurrency()).toBe('USD')
            })
        })

        describe('resetPricingIndex', () => {
            it('should reset without error', () => {
                expect(() => metricsCollector.resetPricingIndex()).not.toThrow()
            })
        })
    })
}

// --- Test helpers ---

function createMockExecution(state: string, nodes: any[], createdDate?: Date, updatedDate?: Date) {
    return {
        id: `exec-${Date.now()}`,
        agentflowId: 'flow-1',
        state,
        executionData: JSON.stringify(nodes),
        createdDate: createdDate || new Date('2026-03-21T10:00:00Z'),
        updatedDate: updatedDate || new Date('2026-03-21T10:00:02Z')
    }
}

function createLLMNode(
    nodeId: string,
    nodeLabel: string,
    usageMetadata: { input_tokens: number; output_tokens: number; total_tokens: number },
    modelName?: string
) {
    const output: any = { usageMetadata }
    if (modelName) {
        output.responseMetadata = { model: modelName }
    }
    return {
        nodeLabel,
        nodeId,
        data: { output },
        previousNodeIds: []
    }
}
