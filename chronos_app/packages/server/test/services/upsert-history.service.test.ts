import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function upsertHistoryServiceTest() {
    describe('Upsert History Service', () => {
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
            mockRepository.delete.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const service = require('../../src/services/upsert-history').default

        describe('getAllUpsertHistory', () => {
            it('should return all upsert history', async () => {
                mockRepository.find.mockResolvedValue([
                    { id: '1', chatflowid: 'flow-1', result: '{"status":"OK"}', flowData: '{"nodes":[]}', date: new Date() }
                ])

                const result = await service.getAllUpsertHistory('ASC', 'flow-1', undefined, undefined)

                expect(result).toHaveLength(1)
                expect(result[0].result).toEqual({ status: 'OK' })
                expect(result[0].flowData).toEqual({ nodes: [] })
            })

            it('should handle date range with both start and end', async () => {
                mockRepository.find.mockResolvedValue([])

                await service.getAllUpsertHistory('DESC', 'flow-1', '2024-01-01', '2024-12-31')

                expect(mockRepository.find).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({ chatflowid: 'flow-1', date: expect.anything() }),
                        order: expect.objectContaining({ date: 'DESC' })
                    })
                )
            })

            it('should handle startDate only', async () => {
                mockRepository.find.mockResolvedValue([])

                await service.getAllUpsertHistory('ASC', 'flow-1', '2024-01-01', undefined)

                expect(mockRepository.find).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({ date: expect.anything() })
                    })
                )
            })

            it('should handle endDate only', async () => {
                mockRepository.find.mockResolvedValue([])

                await service.getAllUpsertHistory('ASC', 'flow-1', undefined, '2024-12-31')

                expect(mockRepository.find).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({ date: expect.anything() })
                    })
                )
            })

            it('should handle null result and flowData', async () => {
                mockRepository.find.mockResolvedValue([{ id: '1', result: null, flowData: null }])

                const result = await service.getAllUpsertHistory('ASC', undefined, undefined, undefined)

                expect(result[0].result).toEqual({})
                expect(result[0].flowData).toEqual({})
            })

            it('should throw on error', async () => {
                mockRepository.find.mockRejectedValue(new Error('DB error'))

                await expect(service.getAllUpsertHistory('ASC', 'flow-1', undefined, undefined)).rejects.toThrow(
                    'Error: upsertHistoryServices.getAllUpsertHistory'
                )
            })
        })

        describe('patchDeleteUpsertHistory', () => {
            it('should delete upsert history by ids', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 2 })

                const result = await service.patchDeleteUpsertHistory(['id-1', 'id-2'])

                expect(result).toEqual({ affected: 2 })
                expect(mockRepository.delete).toHaveBeenCalledWith(['id-1', 'id-2'])
            })

            it('should throw on error', async () => {
                mockRepository.delete.mockRejectedValue(new Error('DB error'))

                await expect(service.patchDeleteUpsertHistory(['id-1'])).rejects.toThrow(
                    'Error: upsertHistoryServices.patchDeleteUpsertHistory'
                )
            })
        })
    })
}
