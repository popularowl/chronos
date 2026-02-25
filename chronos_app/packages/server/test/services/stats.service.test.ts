const getChatMessageExports = require('../../src/utils/getChatMessage')

export function statsServiceTest() {
    describe('Stats Service', () => {
        const origUtilGetChatMessage = getChatMessageExports.utilGetChatMessage

        beforeEach(() => {
            getChatMessageExports.utilGetChatMessage = jest.fn()
        })

        afterEach(() => {
            getChatMessageExports.utilGetChatMessage = origUtilGetChatMessage
        })

        const statsService = require('../../src/services/stats').default

        describe('getChatflowStats', () => {
            it('should return stats for a chatflow', async () => {
                const mockMessages = [
                    { id: 'msg-1', sessionId: 'session-1', feedback: { rating: 'THUMBS_UP' } },
                    { id: 'msg-2', sessionId: 'session-1', feedback: { rating: 'THUMBS_DOWN' } },
                    { id: 'msg-3', sessionId: 'session-2', feedback: null }
                ]
                getChatMessageExports.utilGetChatMessage.mockResolvedValue(mockMessages)

                const result = await statsService.getChatflowStats('flow-1', undefined)

                expect(result).toEqual({
                    totalMessages: 3,
                    totalFeedback: 2,
                    positiveFeedback: 1,
                    totalSessions: 2
                })
            })

            it('should return zero stats when no messages', async () => {
                getChatMessageExports.utilGetChatMessage.mockResolvedValue([])

                const result = await statsService.getChatflowStats('flow-1', undefined)

                expect(result).toEqual({
                    totalMessages: 0,
                    totalFeedback: 0,
                    positiveFeedback: 0,
                    totalSessions: 0
                })
            })

            it('should throw InternalChronosError on error', async () => {
                getChatMessageExports.utilGetChatMessage.mockRejectedValue(new Error('DB error'))

                await expect(statsService.getChatflowStats('flow-1', undefined)).rejects.toThrow(
                    'Error: statsService.getChatflowStats'
                )
            })

            it('should pass date range and feedback params', async () => {
                getChatMessageExports.utilGetChatMessage.mockResolvedValue([])

                await statsService.getChatflowStats('flow-1', ['INTERNAL'], '2024-01-01', '2024-12-31', undefined, true, ['THUMBS_UP'])

                expect(getChatMessageExports.utilGetChatMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        chatflowid: 'flow-1',
                        chatTypes: ['INTERNAL'],
                        startDate: '2024-01-01',
                        endDate: '2024-12-31',
                        feedback: true,
                        feedbackTypes: ['THUMBS_UP']
                    })
                )
            })
        })
    })
}
