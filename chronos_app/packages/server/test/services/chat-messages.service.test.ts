import { ChatType, ChatMessageRatingType, MODE } from '../../src/Interface'

/**
 * Test suite for Chat Messages service
 * Tests CRUD operations and message management with mocked dependencies
 */
export function chatMessagesServiceTest() {
    describe('Chat Messages Service', () => {
        let chatMessagesService: any
        let mockUtilAddChatMessage: jest.Mock
        let mockUtilGetChatMessage: jest.Mock
        let mockRemoveFilesFromStorage: jest.Mock
        let mockUpdateStorageUsage: jest.Mock
        let mockGetRunningExpressApp: jest.Mock

        // Mock app server components
        let mockChatMessageRepository: any
        let mockChatMessageFeedbackRepository: any
        let mockExecutionRepository: any
        let mockAbortControllerPool: any
        let mockQueueManager: any

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create fresh mocks for utility functions
            mockUtilAddChatMessage = jest.fn()
            mockUtilGetChatMessage = jest.fn()
            mockRemoveFilesFromStorage = jest.fn()
            mockUpdateStorageUsage = jest.fn()

            // Create mock repositories
            mockChatMessageRepository = {
                find: jest.fn(),
                findByIds: jest.fn(),
                delete: jest.fn()
            }
            mockChatMessageFeedbackRepository = {
                find: jest.fn(),
                delete: jest.fn()
            }
            mockExecutionRepository = {
                delete: jest.fn()
            }

            // Create mock abort controller pool
            mockAbortControllerPool = {
                abort: jest.fn()
            }

            // Create mock queue manager
            mockQueueManager = {
                getPredictionQueueEventsProducer: jest.fn().mockReturnValue({
                    publishEvent: jest.fn().mockResolvedValue(undefined)
                })
            }

            // Create mock app server
            mockGetRunningExpressApp = jest.fn().mockReturnValue({
                AppDataSource: {
                    getRepository: jest.fn((entity: any) => {
                        const entityName = typeof entity === 'function' ? entity.name : entity
                        if (entityName === 'ChatMessage') return mockChatMessageRepository
                        if (entityName === 'ChatMessageFeedback') return mockChatMessageFeedbackRepository
                        if (entityName === 'Execution') return mockExecutionRepository
                        return {}
                    })
                },
                abortControllerPool: mockAbortControllerPool,
                queueManager: mockQueueManager
            })

            // Setup mocks before importing service
            jest.doMock('../../src/utils/addChatMesage', () => ({
                utilAddChatMessage: (...args: any[]) => mockUtilAddChatMessage(...args)
            }))

            jest.doMock('../../src/utils/getChatMessage', () => ({
                utilGetChatMessage: (...args: any[]) => mockUtilGetChatMessage(...args)
            }))

            jest.doMock('chronos-components', () => ({
                removeFilesFromStorage: (...args: any[]) => mockRemoveFilesFromStorage(...args)
            }))

            jest.doMock('../../src/utils/quotaUsage', () => ({
                updateStorageUsage: (...args: any[]) => mockUpdateStorageUsage(...args)
            }))

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: () => mockGetRunningExpressApp()
            }))

            // Import service after mocks are set up
            chatMessagesService = require('../../src/services/chat-messages').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            // Reset environment
            delete process.env.MODE
        })

        describe('createChatMessage', () => {
            it('should create a new chat message', async () => {
                const newMessage = {
                    agentflowid: 'flow-123',
                    content: 'Hello, world!',
                    role: 'userMessage',
                    chatId: 'chat-456'
                }
                const savedMessage = { id: 'msg-1', ...newMessage }
                mockUtilAddChatMessage.mockResolvedValue(savedMessage)

                const result = await chatMessagesService.createChatMessage(newMessage)

                expect(result).toEqual(savedMessage)
                expect(mockUtilAddChatMessage).toHaveBeenCalledWith(newMessage)
            })

            it('should propagate errors from utilAddChatMessage', async () => {
                mockUtilAddChatMessage.mockRejectedValue(new Error('Database error'))

                await expect(chatMessagesService.createChatMessage({ agentflowid: 'flow-1' })).rejects.toThrow(
                    'chatMessagesService.createChatMessage'
                )
            })
        })

        describe('getAllChatMessages', () => {
            it('should return all chat messages for an agentflow', async () => {
                const mockMessages = [
                    { id: 'msg-1', content: 'Hello', role: 'userMessage' },
                    { id: 'msg-2', content: 'Hi there!', role: 'apiMessage' }
                ]
                mockUtilGetChatMessage.mockResolvedValue(mockMessages)

                const result = await chatMessagesService.getAllChatMessages('flow-123', undefined)

                expect(result).toEqual(mockMessages)
                expect(mockUtilGetChatMessage).toHaveBeenCalledWith({
                    agentflowid: 'flow-123',
                    chatTypes: undefined,
                    sortOrder: 'ASC',
                    chatId: undefined,
                    memoryType: undefined,
                    sessionId: undefined,
                    startDate: undefined,
                    endDate: undefined,
                    messageId: undefined,
                    feedback: undefined,
                    feedbackTypes: undefined,
                    page: undefined,
                    pageSize: undefined
                })
            })

            it('should pass all filter parameters', async () => {
                mockUtilGetChatMessage.mockResolvedValue([])

                await chatMessagesService.getAllChatMessages(
                    'flow-123',
                    [ChatType.INTERNAL],
                    'DESC',
                    'chat-456',
                    'buffer',
                    'session-789',
                    '2024-01-01',
                    '2024-12-31',
                    'msg-100',
                    true,
                    [ChatMessageRatingType.THUMBS_UP],
                    1,
                    10
                )

                expect(mockUtilGetChatMessage).toHaveBeenCalledWith({
                    agentflowid: 'flow-123',
                    chatTypes: [ChatType.INTERNAL],
                    sortOrder: 'DESC',
                    chatId: 'chat-456',
                    memoryType: 'buffer',
                    sessionId: 'session-789',
                    startDate: '2024-01-01',
                    endDate: '2024-12-31',
                    messageId: 'msg-100',
                    feedback: true,
                    feedbackTypes: [ChatMessageRatingType.THUMBS_UP],
                    page: 1,
                    pageSize: 10
                })
            })

            it('should propagate errors', async () => {
                mockUtilGetChatMessage.mockRejectedValue(new Error('Query failed'))

                await expect(chatMessagesService.getAllChatMessages('flow-123', undefined)).rejects.toThrow(
                    'chatMessagesService.getAllChatMessages'
                )
            })
        })

        describe('getAllInternalChatMessages', () => {
            it('should return internal chat messages', async () => {
                const mockMessages = [{ id: 'msg-1', content: 'Internal message' }]
                mockUtilGetChatMessage.mockResolvedValue(mockMessages)

                const result = await chatMessagesService.getAllInternalChatMessages('flow-123', [ChatType.INTERNAL])

                expect(result).toEqual(mockMessages)
                expect(mockUtilGetChatMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentflowid: 'flow-123',
                        chatTypes: [ChatType.INTERNAL]
                    })
                )
            })

            it('should support all filter parameters', async () => {
                mockUtilGetChatMessage.mockResolvedValue([])

                await chatMessagesService.getAllInternalChatMessages(
                    'flow-123',
                    [ChatType.INTERNAL],
                    'DESC',
                    'chat-456',
                    'buffer',
                    'session-789',
                    '2024-01-01',
                    '2024-12-31',
                    'msg-100',
                    true,
                    [ChatMessageRatingType.THUMBS_DOWN]
                )

                expect(mockUtilGetChatMessage).toHaveBeenCalledWith({
                    agentflowid: 'flow-123',
                    chatTypes: [ChatType.INTERNAL],
                    sortOrder: 'DESC',
                    chatId: 'chat-456',
                    memoryType: 'buffer',
                    sessionId: 'session-789',
                    startDate: '2024-01-01',
                    endDate: '2024-12-31',
                    messageId: 'msg-100',
                    feedback: true,
                    feedbackTypes: [ChatMessageRatingType.THUMBS_DOWN]
                })
            })
        })

        describe('removeAllChatMessages', () => {
            const mockUsageCacheManager = {} as any

            it('should delete chat messages and related feedback', async () => {
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 2 })
                mockRemoveFilesFromStorage.mockResolvedValue({ totalSize: 1024 })
                mockUpdateStorageUsage.mockResolvedValue(undefined)
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 5 })

                const result = await chatMessagesService.removeAllChatMessages(
                    'chat-456',
                    'flow-123',
                    { chatId: 'chat-456' },
                    mockUsageCacheManager
                )

                expect(result).toEqual({ affected: 5 })
                expect(mockChatMessageFeedbackRepository.delete).toHaveBeenCalledWith({ chatId: 'chat-456' })
                expect(mockRemoveFilesFromStorage).toHaveBeenCalledWith('', 'flow-123', 'chat-456')
                expect(mockUpdateStorageUsage).toHaveBeenCalledWith('', '', 1024, mockUsageCacheManager)
                expect(mockChatMessageRepository.delete).toHaveBeenCalledWith({ chatId: 'chat-456' })
            })

            it('should handle file deletion errors gracefully', async () => {
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 0 })
                mockRemoveFilesFromStorage.mockRejectedValue(new Error('File not found'))
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 3 })

                const result = await chatMessagesService.removeAllChatMessages(
                    'chat-456',
                    'flow-123',
                    { agentflowid: 'flow-123' },
                    mockUsageCacheManager
                )

                // Should still succeed despite file deletion error
                expect(result).toEqual({ affected: 3 })
            })

            it('should skip file deletion when chatId is not provided', async () => {
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 0 })
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 1 })

                await chatMessagesService.removeAllChatMessages('', 'flow-123', { agentflowid: 'flow-123' }, mockUsageCacheManager)

                expect(mockRemoveFilesFromStorage).not.toHaveBeenCalled()
            })
        })

        describe('removeChatMessagesByMessageIds', () => {
            const mockUsageCacheManager = {} as any

            it('should delete messages by IDs and clean up related data', async () => {
                const messageIds = ['msg-1', 'msg-2']
                const chatIdMap = new Map([['chat-456_session-1', []]])

                mockChatMessageRepository.findByIds.mockResolvedValue([
                    { id: 'msg-1', executionId: 'exec-1' },
                    { id: 'msg-2', executionId: null }
                ])
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 1 })
                mockRemoveFilesFromStorage.mockResolvedValue({ totalSize: 512 })
                mockUpdateStorageUsage.mockResolvedValue(undefined)
                mockExecutionRepository.delete.mockResolvedValue({ affected: 1 })
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 2 })

                const result = await chatMessagesService.removeChatMessagesByMessageIds(
                    'flow-123',
                    chatIdMap,
                    messageIds,
                    mockUsageCacheManager
                )

                expect(result).toEqual({ affected: 2 })
                expect(mockChatMessageRepository.findByIds).toHaveBeenCalledWith(messageIds)
                expect(mockChatMessageFeedbackRepository.delete).toHaveBeenCalledWith({ chatId: 'chat-456' })
                expect(mockExecutionRepository.delete).toHaveBeenCalledWith(['exec-1'])
                expect(mockChatMessageRepository.delete).toHaveBeenCalledWith(messageIds)
            })

            it('should skip execution deletion when no executionIds exist', async () => {
                const messageIds = ['msg-1']
                const chatIdMap = new Map([['chat-456_session-1', []]])

                mockChatMessageRepository.findByIds.mockResolvedValue([{ id: 'msg-1', executionId: null }])
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 0 })
                mockRemoveFilesFromStorage.mockResolvedValue({ totalSize: 0 })
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 1 })

                await chatMessagesService.removeChatMessagesByMessageIds('flow-123', chatIdMap, messageIds, mockUsageCacheManager)

                expect(mockExecutionRepository.delete).not.toHaveBeenCalled()
            })

            it('should handle file deletion errors gracefully', async () => {
                const messageIds = ['msg-1']
                const chatIdMap = new Map([['chat-456_session-1', []]])

                mockChatMessageRepository.findByIds.mockResolvedValue([])
                mockChatMessageFeedbackRepository.delete.mockResolvedValue({ affected: 0 })
                mockRemoveFilesFromStorage.mockRejectedValue(new Error('Storage error'))
                mockChatMessageRepository.delete.mockResolvedValue({ affected: 1 })

                const result = await chatMessagesService.removeChatMessagesByMessageIds(
                    'flow-123',
                    chatIdMap,
                    messageIds,
                    mockUsageCacheManager
                )

                expect(result).toEqual({ affected: 1 })
            })
        })

        describe('abortChatMessage', () => {
            it('should abort via abort controller pool in default mode', async () => {
                await chatMessagesService.abortChatMessage('chat-456', 'flow-123')

                expect(mockAbortControllerPool.abort).toHaveBeenCalledWith('flow-123_chat-456')
            })

            it('should publish abort event in queue mode', async () => {
                process.env.MODE = MODE.QUEUE

                await chatMessagesService.abortChatMessage('chat-456', 'flow-123')

                expect(mockQueueManager.getPredictionQueueEventsProducer).toHaveBeenCalled()
                expect(mockQueueManager.getPredictionQueueEventsProducer().publishEvent).toHaveBeenCalledWith({
                    eventName: 'abort',
                    id: 'flow-123_chat-456'
                })
                expect(mockAbortControllerPool.abort).not.toHaveBeenCalled()
            })
        })

        describe('getMessagesByAgentflowIds', () => {
            it('should return messages for multiple agentflow IDs', async () => {
                const mockMessages = [
                    { id: 'msg-1', agentflowid: 'flow-1' },
                    { id: 'msg-2', agentflowid: 'flow-2' }
                ]
                mockChatMessageRepository.find.mockResolvedValue(mockMessages)

                const result = await chatMessagesService.getMessagesByAgentflowIds(['flow-1', 'flow-2'])

                expect(result).toEqual(mockMessages)
                expect(mockChatMessageRepository.find).toHaveBeenCalledWith({
                    where: { agentflowid: expect.anything() }
                })
            })

            it('should return empty array when no messages found', async () => {
                mockChatMessageRepository.find.mockResolvedValue([])

                const result = await chatMessagesService.getMessagesByAgentflowIds(['flow-999'])

                expect(result).toEqual([])
            })
        })

        describe('getMessagesFeedbackByAgentflowIds', () => {
            it('should return feedback for multiple agentflow IDs', async () => {
                const mockFeedback = [
                    { id: 'fb-1', agentflowid: 'flow-1', rating: 'THUMBS_UP' },
                    { id: 'fb-2', agentflowid: 'flow-2', rating: 'THUMBS_DOWN' }
                ]
                mockChatMessageFeedbackRepository.find.mockResolvedValue(mockFeedback)

                const result = await chatMessagesService.getMessagesFeedbackByAgentflowIds(['flow-1', 'flow-2'])

                expect(result).toEqual(mockFeedback)
                expect(mockChatMessageFeedbackRepository.find).toHaveBeenCalledWith({
                    where: { agentflowid: expect.anything() }
                })
            })

            it('should return empty array when no feedback found', async () => {
                mockChatMessageFeedbackRepository.find.mockResolvedValue([])

                const result = await chatMessagesService.getMessagesFeedbackByAgentflowIds(['flow-999'])

                expect(result).toEqual([])
            })
        })
    })
}
