import { createMockRepository } from '../mocks/appServer.mock'
import { ChatMessageRatingType } from '../../src/Interface'

/**
 * Test suite for Feedback Validation functions
 * Tests validation logic for feedback operations
 */
export function feedbackValidationServiceTest() {
    describe('Feedback Validation Service', () => {
        let validateMessageExists: any
        let validateFeedbackExists: any
        let validateFeedbackForCreation: any
        let validateFeedbackForUpdate: any
        let mockChatMessageRepository: ReturnType<typeof createMockRepository>
        let mockFeedbackRepository: ReturnType<typeof createMockRepository>
        let mockAppServer: any

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create fresh mocks
            mockChatMessageRepository = createMockRepository()
            mockFeedbackRepository = createMockRepository()

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn((entity: any) => {
                        const entityName = typeof entity === 'function' ? entity.name : entity
                        if (entityName === 'ChatMessage') return mockChatMessageRepository
                        if (entityName === 'ChatMessageFeedback') return mockFeedbackRepository
                        return mockChatMessageRepository
                    })
                }
            }

            // Setup mocks before importing service
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            // Import validation functions after mocks are set up
            const validation = require('../../src/services/feedback/validation')
            validateMessageExists = validation.validateMessageExists
            validateFeedbackExists = validation.validateFeedbackExists
            validateFeedbackForCreation = validation.validateFeedbackForCreation
            validateFeedbackForUpdate = validation.validateFeedbackForUpdate
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
        })

        describe('validateMessageExists', () => {
            it('should return message when it exists', async () => {
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1',
                    content: 'Test message'
                }
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const result = await validateMessageExists('msg-1')

                expect(mockChatMessageRepository.findOne).toHaveBeenCalledWith({
                    where: { id: 'msg-1' }
                })
                expect(result).toEqual(mockMessage)
            })

            it('should throw NOT_FOUND error when message does not exist', async () => {
                mockChatMessageRepository.findOne.mockResolvedValue(null)

                await expect(validateMessageExists('non-existent')).rejects.toThrow('not found')
            })
        })

        describe('validateFeedbackExists', () => {
            it('should return feedback when it exists', async () => {
                const mockFeedback = {
                    id: 'fb-1',
                    messageId: 'msg-1',
                    rating: ChatMessageRatingType.THUMBS_UP
                }
                mockFeedbackRepository.findOne.mockResolvedValue(mockFeedback)

                const result = await validateFeedbackExists('fb-1')

                expect(mockFeedbackRepository.findOne).toHaveBeenCalledWith({
                    where: { id: 'fb-1' }
                })
                expect(result).toEqual(mockFeedback)
            })

            it('should throw NOT_FOUND error when feedback does not exist', async () => {
                mockFeedbackRepository.findOne.mockResolvedValue(null)

                await expect(validateFeedbackExists('non-existent')).rejects.toThrow('not found')
            })
        })

        describe('validateFeedbackForCreation', () => {
            it('should throw BAD_REQUEST when messageId is missing', async () => {
                await expect(validateFeedbackForCreation({})).rejects.toThrow('Message ID is required')
            })

            it('should validate and return feedback with message data', async () => {
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const feedback = { messageId: 'msg-1', rating: ChatMessageRatingType.THUMBS_UP }
                const result = await validateFeedbackForCreation(feedback)

                expect(result.chatId).toBe('chat-1')
                expect(result.agentflowid).toBe('flow-1')
            })

            it('should use provided chatId if it matches message', async () => {
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const feedback = { messageId: 'msg-1', chatId: 'chat-1' }
                const result = await validateFeedbackForCreation(feedback)

                expect(result.chatId).toBe('chat-1')
            })

            it('should throw BAD_REQUEST when chatId does not match message', async () => {
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const feedback = { messageId: 'msg-1', chatId: 'different-chat' }

                await expect(validateFeedbackForCreation(feedback)).rejects.toThrow('Inconsistent chat ID')
            })

            it('should throw BAD_REQUEST when agentflowid does not match message', async () => {
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const feedback = { messageId: 'msg-1', agentflowid: 'different-flow' }

                await expect(validateFeedbackForCreation(feedback)).rejects.toThrow('Inconsistent agentflow ID')
            })
        })

        describe('validateFeedbackForUpdate', () => {
            it('should validate existing feedback and return merged data', async () => {
                const existingFeedback = {
                    id: 'fb-1',
                    messageId: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockFeedbackRepository.findOne.mockResolvedValue(existingFeedback)
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const result = await validateFeedbackForUpdate('fb-1', { rating: ChatMessageRatingType.THUMBS_DOWN })

                expect(result.messageId).toBe('msg-1')
                expect(result.chatId).toBe('chat-1')
                expect(result.agentflowid).toBe('flow-1')
            })

            it('should throw NOT_FOUND when feedback does not exist', async () => {
                mockFeedbackRepository.findOne.mockResolvedValue(null)

                await expect(validateFeedbackForUpdate('non-existent', {})).rejects.toThrow('not found')
            })

            it('should use existing feedback values if not provided in update', async () => {
                const existingFeedback = {
                    id: 'fb-1',
                    messageId: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockFeedbackRepository.findOne.mockResolvedValue(existingFeedback)
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                const result = await validateFeedbackForUpdate('fb-1', {})

                expect(result.messageId).toBe('msg-1')
                expect(result.chatId).toBe('chat-1')
                expect(result.agentflowid).toBe('flow-1')
            })

            it('should throw BAD_REQUEST when chatId in update does not match message', async () => {
                const existingFeedback = {
                    id: 'fb-1',
                    messageId: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockFeedbackRepository.findOne.mockResolvedValue(existingFeedback)
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                await expect(validateFeedbackForUpdate('fb-1', { chatId: 'different-chat' })).rejects.toThrow('Inconsistent chat ID')
            })

            it('should throw BAD_REQUEST when agentflowid in update does not match message', async () => {
                const existingFeedback = {
                    id: 'fb-1',
                    messageId: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                const mockMessage = {
                    id: 'msg-1',
                    chatId: 'chat-1',
                    agentflowid: 'flow-1'
                }
                mockFeedbackRepository.findOne.mockResolvedValue(existingFeedback)
                mockChatMessageRepository.findOne.mockResolvedValue(mockMessage)

                await expect(validateFeedbackForUpdate('fb-1', { agentflowid: 'different-flow' })).rejects.toThrow(
                    'Inconsistent agentflow ID'
                )
            })
        })
    })
}
