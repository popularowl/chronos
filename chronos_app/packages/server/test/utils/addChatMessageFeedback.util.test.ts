import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function addChatMessageFeedbackUtilTest() {
    describe('addChatMessageFeedback Util', () => {
        const mockRepository = createMockRepository()
        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            }
        }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.create.mockReset()
            mockRepository.save.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilAddChatMessageFeedback } = require('../../src/utils/addChatMessageFeedback')

        it('should create and save chat message feedback', async () => {
            const feedback = { chatflowid: 'flow-1', chatId: 'chat-1', content: 'Great!', rating: 'THUMBS_UP' }
            mockRepository.create.mockReturnValue(feedback)
            mockRepository.save.mockResolvedValue({ id: 'fb-1', ...feedback })

            const result = await utilAddChatMessageFeedback(feedback)

            expect(result).toHaveProperty('id', 'fb-1')
            expect(mockRepository.create).toHaveBeenCalled()
            expect(mockRepository.save).toHaveBeenCalled()
        })
    })
}
