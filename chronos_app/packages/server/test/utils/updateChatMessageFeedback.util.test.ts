import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function updateChatMessageFeedbackUtilTest() {
    describe('updateChatMessageFeedback util', () => {
        const mockFeedbackRepo = createMockRepository()
        const mockChatFlowRepo = createMockRepository()
        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn((entity: any) => {
                    const name = typeof entity === 'function' ? entity.name : entity
                    if (name === 'ChatMessageFeedback') return mockFeedbackRepo
                    if (name === 'ChatFlow') return mockChatFlowRepo
                    return mockFeedbackRepo
                })
            }
        }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            mockFeedbackRepo.update.mockReset()
            mockFeedbackRepo.findOne.mockReset()
            mockChatFlowRepo.findOne.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilUpdateChatMessageFeedback } = require('../../src/utils/updateChatMessageFeedback')

        it('should update feedback and return OK', async () => {
            const feedbackData = { rating: 'THUMBS_UP', content: 'Great response' }
            mockFeedbackRepo.update.mockResolvedValue({ affected: 1 })
            mockFeedbackRepo.findOne.mockResolvedValue({ id: 'fb-1', chatflowid: 'flow-1', ...feedbackData })
            mockChatFlowRepo.findOne.mockResolvedValue({ id: 'flow-1', analytic: '{}' })

            const result = await utilUpdateChatMessageFeedback('fb-1', feedbackData)

            expect(result).toEqual({ status: 'OK' })
            expect(mockFeedbackRepo.update).toHaveBeenCalledWith({ id: 'fb-1' }, feedbackData)
        })

        it('should handle chatflow with no analytic data', async () => {
            mockFeedbackRepo.update.mockResolvedValue({ affected: 1 })
            mockFeedbackRepo.findOne.mockResolvedValue({ id: 'fb-1', chatflowid: 'flow-1', rating: 'THUMBS_DOWN' })
            mockChatFlowRepo.findOne.mockResolvedValue({ id: 'flow-1', analytic: null })

            const result = await utilUpdateChatMessageFeedback('fb-1', { rating: 'THUMBS_DOWN' })

            expect(result).toEqual({ status: 'OK' })
        })
    })
}
