import { ChatMessageRatingType } from '../../src/Interface'

/**
 * Test suite for Feedback service
 * Tests feedback CRUD operations
 */
export function feedbackServiceTest() {
    describe('Feedback Service', () => {
        let feedbackService: any
        let mockGetFeedback: jest.Mock
        let mockAddFeedback: jest.Mock
        let mockUpdateFeedback: jest.Mock

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create fresh mocks
            mockGetFeedback = jest.fn()
            mockAddFeedback = jest.fn()
            mockUpdateFeedback = jest.fn()

            // Setup mocks before importing service
            jest.doMock('../../src/utils/getChatMessageFeedback', () => ({
                utilGetChatMessageFeedback: (...args: any[]) => mockGetFeedback(...args)
            }))

            jest.doMock('../../src/utils/addChatMessageFeedback', () => ({
                utilAddChatMessageFeedback: (...args: any[]) => mockAddFeedback(...args)
            }))

            jest.doMock('../../src/utils/updateChatMessageFeedback', () => ({
                utilUpdateChatMessageFeedback: (...args: any[]) => mockUpdateFeedback(...args)
            }))

            // Import service after mocks are set up
            feedbackService = require('../../src/services/feedback').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
        })

        describe('getAllChatMessageFeedback', () => {
            it('should return all feedback for an agentflow', async () => {
                const mockFeedback = [
                    { id: 'fb-1', rating: ChatMessageRatingType.THUMBS_UP, content: 'Great!' },
                    { id: 'fb-2', rating: ChatMessageRatingType.THUMBS_DOWN, content: 'Needs improvement' }
                ]
                mockGetFeedback.mockResolvedValue(mockFeedback)

                const result = await feedbackService.getAllChatMessageFeedback('flow-1', undefined, undefined, undefined, undefined)

                expect(mockGetFeedback).toHaveBeenCalledWith('flow-1', undefined, undefined, undefined, undefined)
                expect(result).toEqual(mockFeedback)
            })

            it('should filter by chatId', async () => {
                mockGetFeedback.mockResolvedValue([])

                await feedbackService.getAllChatMessageFeedback('flow-1', 'chat-1', undefined, undefined, undefined)

                expect(mockGetFeedback).toHaveBeenCalledWith('flow-1', 'chat-1', undefined, undefined, undefined)
            })

            it('should apply sort order', async () => {
                mockGetFeedback.mockResolvedValue([])

                await feedbackService.getAllChatMessageFeedback('flow-1', undefined, 'DESC', undefined, undefined)

                expect(mockGetFeedback).toHaveBeenCalledWith('flow-1', undefined, 'DESC', undefined, undefined)
            })

            it('should filter by date range', async () => {
                mockGetFeedback.mockResolvedValue([])

                await feedbackService.getAllChatMessageFeedback('flow-1', undefined, undefined, '2024-01-01', '2024-12-31')

                expect(mockGetFeedback).toHaveBeenCalledWith('flow-1', undefined, undefined, '2024-01-01', '2024-12-31')
            })

            it('should throw error on utility failure', async () => {
                mockGetFeedback.mockRejectedValue(new Error('Utility error'))

                await expect(
                    feedbackService.getAllChatMessageFeedback('flow-1', undefined, undefined, undefined, undefined)
                ).rejects.toThrow()
            })
        })

        describe('createChatMessageFeedbackForAgentflow', () => {
            it('should create new feedback', async () => {
                const feedbackData = {
                    agentflowid: 'flow-1',
                    chatId: 'chat-1',
                    messageId: 'msg-1',
                    rating: ChatMessageRatingType.THUMBS_UP,
                    content: 'Excellent response!'
                }
                const savedFeedback = { id: 'fb-1', ...feedbackData }
                mockAddFeedback.mockResolvedValue(savedFeedback)

                const result = await feedbackService.createChatMessageFeedbackForAgentflow(feedbackData)

                expect(mockAddFeedback).toHaveBeenCalledWith(feedbackData)
                expect(result).toEqual(savedFeedback)
            })

            it('should create feedback with minimal data', async () => {
                const feedbackData = {
                    messageId: 'msg-1',
                    rating: ChatMessageRatingType.THUMBS_DOWN
                }
                mockAddFeedback.mockResolvedValue({ id: 'fb-1', ...feedbackData })

                const result = await feedbackService.createChatMessageFeedbackForAgentflow(feedbackData)

                expect(mockAddFeedback).toHaveBeenCalledWith(feedbackData)
                expect(result).toBeDefined()
            })

            it('should throw error on utility failure', async () => {
                mockAddFeedback.mockRejectedValue(new Error('Utility error'))

                await expect(feedbackService.createChatMessageFeedbackForAgentflow({ messageId: 'msg-1' })).rejects.toThrow()
            })
        })

        describe('updateChatMessageFeedbackForAgentflow', () => {
            it('should update existing feedback', async () => {
                const updateData = {
                    rating: ChatMessageRatingType.THUMBS_UP,
                    content: 'Updated feedback'
                }
                const updatedFeedback = { id: 'fb-1', ...updateData }
                mockUpdateFeedback.mockResolvedValue(updatedFeedback)

                const result = await feedbackService.updateChatMessageFeedbackForAgentflow('fb-1', updateData)

                expect(mockUpdateFeedback).toHaveBeenCalledWith('fb-1', updateData)
                expect(result).toEqual(updatedFeedback)
            })

            it('should update only content', async () => {
                const updateData = { content: 'New content' }
                mockUpdateFeedback.mockResolvedValue({ id: 'fb-1', ...updateData })

                const result = await feedbackService.updateChatMessageFeedbackForAgentflow('fb-1', updateData)

                expect(mockUpdateFeedback).toHaveBeenCalledWith('fb-1', updateData)
                expect(result).toBeDefined()
            })

            it('should update only rating', async () => {
                const updateData = { rating: ChatMessageRatingType.THUMBS_DOWN }
                mockUpdateFeedback.mockResolvedValue({ id: 'fb-1', ...updateData })

                const result = await feedbackService.updateChatMessageFeedbackForAgentflow('fb-1', updateData)

                expect(mockUpdateFeedback).toHaveBeenCalledWith('fb-1', updateData)
                expect(result).toBeDefined()
            })

            it('should throw error on utility failure', async () => {
                mockUpdateFeedback.mockRejectedValue(new Error('Utility error'))

                await expect(
                    feedbackService.updateChatMessageFeedbackForAgentflow('fb-1', { rating: ChatMessageRatingType.THUMBS_UP })
                ).rejects.toThrow()
            })
        })
    })
}
