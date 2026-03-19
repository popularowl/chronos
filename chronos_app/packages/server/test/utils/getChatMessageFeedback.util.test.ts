import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function getChatMessageFeedbackUtilTest() {
    describe('getChatMessageFeedback util', () => {
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
            mockRepository.find.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilGetChatMessageFeedback } = require('../../src/utils/getChatMessageFeedback')

        it('should return feedback for an agentflow', async () => {
            const mockFeedback = [{ id: 'fb-1', agentflowid: 'flow-1', rating: 'THUMBS_UP' }]
            mockRepository.find.mockResolvedValue(mockFeedback)

            const result = await utilGetChatMessageFeedback('flow-1')

            expect(result).toEqual(mockFeedback)
            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ agentflowid: 'flow-1' }),
                    order: expect.objectContaining({ createdDate: 'ASC' })
                })
            )
        })

        it('should support DESC sort order', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessageFeedback('flow-1', undefined, 'DESC')

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: expect.objectContaining({ createdDate: 'DESC' })
                })
            )
        })

        it('should support date range filtering', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessageFeedback('flow-1', undefined, 'ASC', '2024-01-01', '2024-12-31')

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        agentflowid: 'flow-1',
                        createdDate: expect.anything()
                    })
                })
            )
        })

        it('should filter by chatId when provided', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessageFeedback('flow-1', 'chat-123')

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ agentflowid: 'flow-1', chatId: 'chat-123' })
                })
            )
        })
    })
}
