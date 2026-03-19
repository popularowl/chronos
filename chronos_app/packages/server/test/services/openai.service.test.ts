import { createMockRepository } from '../mocks/appServer.mock'

export function openaiServiceTest() {
    describe('OpenAI Service', () => {
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockAppServer: any
        let openaiService: any

        beforeAll(() => {
            jest.resetModules()

            mockRepository = createMockRepository()
            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                }
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            openaiService = require('../../src/services/openai').default
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
        })

        // -------------------- transformMessages --------------------

        describe('transformMessages', () => {
            it('should extract question from single user message', () => {
                const result = openaiService.transformMessages([{ role: 'user', content: 'Hello' }])

                expect(result.question).toBe('Hello')
                expect(result.history).toEqual([])
                expect(result.systemMessage).toBeUndefined()
            })

            it('should extract system message', () => {
                const result = openaiService.transformMessages([
                    { role: 'system', content: 'You are helpful.' },
                    { role: 'user', content: 'Hello' }
                ])

                expect(result.question).toBe('Hello')
                expect(result.systemMessage).toBe('You are helpful.')
                expect(result.history).toEqual([])
            })

            it('should build history from prior messages', () => {
                const result = openaiService.transformMessages([
                    { role: 'user', content: 'What is 2+2?' },
                    { role: 'assistant', content: '4' },
                    { role: 'user', content: 'And 3+3?' }
                ])

                expect(result.question).toBe('And 3+3?')
                expect(result.history).toEqual([
                    { message: 'What is 2+2?', type: 'userMessage' },
                    { message: '4', type: 'apiMessage' }
                ])
            })

            it('should use last user message as question', () => {
                const result = openaiService.transformMessages([
                    { role: 'user', content: 'First' },
                    { role: 'assistant', content: 'Response' },
                    { role: 'user', content: 'Second' },
                    { role: 'assistant', content: 'Response 2' },
                    { role: 'user', content: 'Third' }
                ])

                expect(result.question).toBe('Third')
                expect(result.history).toHaveLength(4)
            })

            it('should throw when messages is empty', () => {
                expect(() => openaiService.transformMessages([])).toThrow('messages array is required')
            })

            it('should throw when no user message exists', () => {
                expect(() => openaiService.transformMessages([{ role: 'system', content: 'System only' }])).toThrow(
                    'At least one user message is required'
                )
            })

            it('should handle null content as empty question', () => {
                // null content becomes empty string — which means no valid question found
                expect(() => openaiService.transformMessages([{ role: 'user', content: null }])).toThrow(
                    'At least one user message is required'
                )
            })

            it('should filter out tool role messages from history', () => {
                const result = openaiService.transformMessages([
                    { role: 'user', content: 'Use the tool' },
                    { role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name: 'test' } }] },
                    { role: 'tool', content: '{"result": 42}', tool_call_id: '1' },
                    { role: 'user', content: 'What was the result?' }
                ])

                expect(result.question).toBe('What was the result?')
                // tool role messages are filtered from history
                expect(result.history).toEqual([
                    { message: 'Use the tool', type: 'userMessage' },
                    { message: '', type: 'apiMessage' }
                ])
            })
        })

        // -------------------- transformResponse --------------------

        describe('transformResponse', () => {
            it('should wrap text response in ChatCompletion format', () => {
                const result = openaiService.transformResponse('agent-123', {
                    text: 'Hello there!',
                    chatMessageId: 'msg-456'
                })

                expect(result.id).toBe('chatcmpl-msg-456')
                expect(result.object).toBe('chat.completion')
                expect(result.model).toBe('agent-123')
                expect(result.choices).toHaveLength(1)
                expect(result.choices[0].message.role).toBe('assistant')
                expect(result.choices[0].message.content).toBe('Hello there!')
                expect(result.choices[0].finish_reason).toBe('stop')
            })

            it('should handle missing text field', () => {
                const result = openaiService.transformResponse('agent-123', {})

                expect(result.choices[0].message.content).toBe('')
            })

            it('should include usage metadata when available', () => {
                const result = openaiService.transformResponse('agent-123', {
                    text: 'Hello',
                    usageMetadata: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
                })

                expect(result.usage.prompt_tokens).toBe(10)
                expect(result.usage.completion_tokens).toBe(20)
                expect(result.usage.total_tokens).toBe(30)
            })

            it('should default usage to zeros when no metadata', () => {
                const result = openaiService.transformResponse('agent-123', { text: 'Hello' })

                expect(result.usage.prompt_tokens).toBe(0)
                expect(result.usage.completion_tokens).toBe(0)
                expect(result.usage.total_tokens).toBe(0)
            })

            it('should stringify non-string content', () => {
                const result = openaiService.transformResponse('agent-123', {
                    text: { key: 'value' }
                })

                expect(result.choices[0].message.content).toBe('{"key":"value"}')
            })
        })

        // -------------------- buildStreamChunk --------------------

        describe('buildStreamChunk', () => {
            it('should build valid SSE data line', () => {
                const chunk = openaiService.buildStreamChunk('cmpl-1', 'agent-1', { content: 'Hi' })

                expect(chunk).toMatch(/^data: /)
                expect(chunk).toMatch(/\n\n$/)

                const parsed = JSON.parse(chunk.replace('data: ', '').trim())
                expect(parsed.id).toBe('cmpl-1')
                expect(parsed.object).toBe('chat.completion.chunk')
                expect(parsed.model).toBe('agent-1')
                expect(parsed.choices[0].delta.content).toBe('Hi')
                expect(parsed.choices[0].finish_reason).toBeNull()
            })

            it('should include finish_reason when provided', () => {
                const chunk = openaiService.buildStreamChunk('cmpl-1', 'agent-1', {}, 'stop')

                const parsed = JSON.parse(chunk.replace('data: ', '').trim())
                expect(parsed.choices[0].finish_reason).toBe('stop')
            })
        })

        // -------------------- listModels --------------------

        describe('listModels', () => {
            it('should return models list with correct shape', async () => {
                const mockAgentflows = [
                    { id: 'af-1', name: 'Agent 1', createdDate: new Date('2024-01-01'), type: 'AGENTFLOW' },
                    { id: 'af-2', name: 'Agent 2', createdDate: new Date('2024-01-02'), type: 'AGENTFLOW' }
                ]
                mockRepository.find.mockResolvedValue(mockAgentflows)

                const result = await openaiService.listModels()

                expect(result.object).toBe('list')
                expect(result.data).toHaveLength(2)
                expect(result.data[0].id).toBe('af-1')
                expect(result.data[0].object).toBe('model')
                expect(result.data[0].owned_by).toBe('chronos')
                expect(result.data[0].name).toBe('Agent 1')
                expect(typeof result.data[0].created).toBe('number')
            })

            it('should return empty list when no agentflows exist', async () => {
                mockRepository.find.mockResolvedValue([])

                const result = await openaiService.listModels()

                expect(result.object).toBe('list')
                expect(result.data).toEqual([])
            })
        })

        // -------------------- getModel --------------------

        describe('getModel', () => {
            it('should return model object for valid agentflow', async () => {
                const mockAgentflow = {
                    id: 'af-1',
                    name: 'Test Agent',
                    type: 'AGENTFLOW',
                    createdDate: new Date('2024-01-01')
                }
                mockRepository.findOneBy.mockResolvedValue(mockAgentflow)

                const result = await openaiService.getModel('af-1')

                expect(result.id).toBe('af-1')
                expect(result.object).toBe('model')
                expect(result.owned_by).toBe('chronos')
                expect(result.name).toBe('Test Agent')
            })

            it('should throw when agentflow not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(openaiService.getModel('nonexistent')).rejects.toThrow("Model 'nonexistent' not found")
            })

            it('should throw when agentflow is not AGENTFLOW type', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 'af-1', type: 'ASSISTANT' })

                await expect(openaiService.getModel('af-1')).rejects.toThrow('not an agentflow')
            })
        })

        // -------------------- resolveAgentflow --------------------

        describe('resolveAgentflow', () => {
            it('should return agentflow for valid id', async () => {
                const mockAgentflow = { id: 'af-1', type: 'AGENTFLOW', name: 'Test' }
                mockRepository.findOneBy.mockResolvedValue(mockAgentflow)

                const result = await openaiService.resolveAgentflow('af-1')

                expect(result).toEqual(mockAgentflow)
            })

            it('should throw 404 for non-existent id', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(openaiService.resolveAgentflow('missing')).rejects.toThrow()
            })
        })
    })
}
