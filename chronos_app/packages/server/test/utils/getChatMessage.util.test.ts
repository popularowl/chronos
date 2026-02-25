import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function getChatMessageUtilTest() {
    describe('getChatMessage util', () => {
        const mockRepository = createMockRepository()
        const mockQueryBuilder = createMockQueryBuilder()
        mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

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
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockQueryBuilder.getMany.mockReset()
            mockQueryBuilder.getRawMany.mockReset()
            mockQueryBuilder.andWhere.mockClear()
            mockQueryBuilder.offset.mockClear()
            mockQueryBuilder.limit.mockClear()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilGetChatMessage } = require('../../src/utils/getChatMessage')

        it('should return messages for a chatflow without filters', async () => {
            const mockMessages = [{ id: 'msg-1', chatflowid: 'flow-1', content: 'Hello' }]
            mockRepository.find.mockResolvedValue(mockMessages)

            const result = await utilGetChatMessage({ chatflowid: 'flow-1' })

            expect(result).toEqual(mockMessages)
            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ chatflowid: 'flow-1' }),
                    order: expect.objectContaining({ createdDate: 'ASC' })
                })
            )
        })

        it('should support DESC sort order', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({ chatflowid: 'flow-1', sortOrder: 'DESC' })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: expect.objectContaining({ createdDate: 'DESC' })
                })
            )
        })

        it('should filter by chatId', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({ chatflowid: 'flow-1', chatId: 'chat-123' })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ chatflowid: 'flow-1', chatId: 'chat-123' })
                })
            )
        })

        it('should filter by date range (both start and end)', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                startDate: '2024-01-01',
                endDate: '2024-12-31'
            })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        chatflowid: 'flow-1',
                        createdDate: expect.anything()
                    })
                })
            )
        })

        it('should filter by startDate only', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({ chatflowid: 'flow-1', startDate: '2024-01-01' })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        createdDate: expect.anything()
                    })
                })
            )
        })

        it('should filter by endDate only', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({ chatflowid: 'flow-1', endDate: '2024-12-31' })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        createdDate: expect.anything()
                    })
                })
            )
        })

        it('should filter by memoryType and sessionId', async () => {
            mockRepository.find.mockResolvedValue([])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                memoryType: 'bufferMemory',
                sessionId: 'session-1'
            })

            expect(mockRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        memoryType: 'bufferMemory',
                        sessionId: 'session-1'
                    })
                })
            )
        })

        it('should handle feedback query with sessionId', async () => {
            mockQueryBuilder.getMany.mockResolvedValue([])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                feedback: true,
                sessionId: 'session-1'
            })

            // Should use query builder for feedback queries
            expect(mockRepository.createQueryBuilder).toHaveBeenCalled()
        })

        it('should handle feedback query with pagination', async () => {
            mockQueryBuilder.getRawMany.mockResolvedValue([{ sessionId: 'session-1' }])
            mockQueryBuilder.getMany.mockResolvedValue([
                {
                    id: 'msg-1',
                    sessionId: 'session-1',
                    role: 'apiMessage',
                    createdDate: new Date()
                }
            ])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                feedback: true,
                page: 1,
                pageSize: 10
            })

            expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0)
            expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10)
        })

        it('should return empty array when paginated feedback query has no sessions', async () => {
            mockQueryBuilder.getRawMany.mockResolvedValue([])

            const result = await utilGetChatMessage({
                chatflowid: 'flow-1',
                feedback: true,
                page: 1,
                pageSize: 10
            })

            expect(result).toEqual([])
        })

        it('should filter by feedbackTypes in feedback query', async () => {
            mockQueryBuilder.getRawMany.mockResolvedValue([{ sessionId: 'session-1' }])
            mockQueryBuilder.getMany.mockResolvedValue([])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                feedback: true,
                feedbackTypes: ['THUMBS_UP' as any],
                page: 1,
                pageSize: 10
            })

            expect(mockQueryBuilder.andWhere).toHaveBeenCalled()
        })

        it('should filter by chatTypes in feedback query', async () => {
            mockQueryBuilder.getRawMany.mockResolvedValue([{ sessionId: 'session-1' }])
            mockQueryBuilder.getMany.mockResolvedValue([])

            await utilGetChatMessage({
                chatflowid: 'flow-1',
                feedback: true,
                chatTypes: ['INTERNAL' as any],
                page: 1,
                pageSize: 10
            })

            expect(mockQueryBuilder.andWhere).toHaveBeenCalled()
        })
    })
}
