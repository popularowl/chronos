import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function addChatMessageUtilTest() {
    describe('addChatMessage util', () => {
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
            mockRepository.create.mockImplementation((entity: any) => entity)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilAddChatMessage } = require('../../src/utils/addChatMesage')

        it('should add a chat message using default AppDataSource', async () => {
            const chatMsg = { chatflowid: 'flow-1', content: 'Hello', role: 'user' }
            mockRepository.save.mockResolvedValue({ id: 'msg-1', ...chatMsg })

            const result = await utilAddChatMessage(chatMsg)

            expect(result).toHaveProperty('id', 'msg-1')
            expect(mockRepository.save).toHaveBeenCalled()
        })

        it('should add createdDate when not provided', async () => {
            const chatMsg = { chatflowid: 'flow-1', content: 'Hello' }
            mockRepository.save.mockImplementation(async (entity: any) => entity)

            const result = await utilAddChatMessage(chatMsg)

            expect(result.createdDate).toBeInstanceOf(Date)
        })

        it('should use provided AppDataSource when given', async () => {
            const customDataSource = {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            }
            const chatMsg = { chatflowid: 'flow-1', content: 'Custom' }
            mockRepository.save.mockResolvedValue({ id: 'msg-2', ...chatMsg })

            await utilAddChatMessage(chatMsg, customDataSource)

            expect(customDataSource.getRepository).toHaveBeenCalled()
        })
    })
}
