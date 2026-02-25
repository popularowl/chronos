import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function datasetServiceTest() {
    describe('Dataset Service', () => {
        const mockDatasetRepo = createMockRepository()
        const mockDatasetRowRepoBase = createMockRepository()
        const mockDatasetRowRepo = Object.assign(mockDatasetRowRepoBase, { count: jest.fn() })
        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn((entity: any) => {
                    const name = typeof entity === 'function' ? entity.name : entity
                    if (name === 'DatasetRow') return mockDatasetRowRepo
                    return mockDatasetRepo
                }),
                transaction: jest.fn()
            }
        }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            jest.clearAllMocks()
            getRunningExpressAppExports.getRunningExpressApp.mockReturnValue(mockAppServer)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const service = require('../../src/services/dataset').default

        describe('getAllDatasets', () => {
            it('should return all datasets without pagination', async () => {
                const mockQb = createMockQueryBuilder()
                mockDatasetRepo.createQueryBuilder.mockReturnValue(mockQb)
                mockQb.getManyAndCount.mockResolvedValue([
                    [{ id: 'ds-1', name: 'Test Dataset' }],
                    1
                ])
                mockDatasetRowRepo.count.mockResolvedValue(5)

                const result = await service.getAllDatasets()

                expect(result).toHaveLength(1)
                expect((result[0] as any).rowCount).toBe(5)
            })

            it('should return paginated datasets', async () => {
                const mockQb = createMockQueryBuilder()
                mockDatasetRepo.createQueryBuilder.mockReturnValue(mockQb)
                mockQb.getManyAndCount.mockResolvedValue([
                    [{ id: 'ds-1', name: 'Test' }],
                    10
                ])
                mockDatasetRowRepo.count.mockResolvedValue(3)

                const result = await service.getAllDatasets(1, 5)

                expect(mockQb.skip).toHaveBeenCalledWith(0)
                expect(mockQb.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ total: 10, data: expect.any(Array) })
            })

            it('should throw on error', async () => {
                mockDatasetRepo.createQueryBuilder.mockImplementation(() => {
                    throw new Error('DB error')
                })

                await expect(service.getAllDatasets()).rejects.toThrow('Error: datasetService.getAllDatasets')
            })
        })

        describe('getDataset', () => {
            it('should return dataset with rows', async () => {
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', name: 'Test' })
                const mockQb = createMockQueryBuilder()
                mockDatasetRowRepo.createQueryBuilder.mockReturnValue(mockQb)
                mockQb.getManyAndCount.mockResolvedValue([
                    [{ id: 'row-1', sequenceNo: 1, input: 'a', output: 'b' }],
                    1
                ])

                const result = await service.getDataset('ds-1')

                expect(result).toEqual(
                    expect.objectContaining({
                        id: 'ds-1',
                        rows: expect.any(Array),
                        total: 1
                    })
                )
            })

            it('should return paginated rows', async () => {
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1' })
                const mockQb = createMockQueryBuilder()
                mockDatasetRowRepo.createQueryBuilder.mockReturnValue(mockQb)
                mockQb.getManyAndCount.mockResolvedValue([[], 0])

                await service.getDataset('ds-1', 2, 10)

                expect(mockQb.skip).toHaveBeenCalledWith(10)
                expect(mockQb.take).toHaveBeenCalledWith(10)
            })

            it('should fix missing sequence numbers (-1)', async () => {
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1' })
                const mockQb = createMockQueryBuilder()
                mockDatasetRowRepo.createQueryBuilder.mockReturnValue(mockQb)

                // First call returns rows with -1 sequenceNo
                let callCount = 0
                mockQb.getManyAndCount.mockImplementation(async () => {
                    callCount++
                    if (callCount === 1) {
                        return [
                            [
                                { id: 'row-1', sequenceNo: 2 },
                                { id: 'row-2', sequenceNo: -1 }
                            ],
                            2
                        ]
                    }
                    // Second call after fixing
                    return [
                        [
                            { id: 'row-1', sequenceNo: 2 },
                            { id: 'row-2', sequenceNo: 3 }
                        ],
                        2
                    ]
                })
                mockDatasetRowRepo.save.mockResolvedValue({})

                const result = await service.getDataset('ds-1')

                expect(mockDatasetRowRepo.save).toHaveBeenCalled()
                expect(result.rows).toHaveLength(2)
            })

            it('should throw on error', async () => {
                mockDatasetRepo.findOneBy.mockRejectedValue(new Error('DB error'))

                await expect(service.getDataset('ds-1')).rejects.toThrow('Error: datasetService.getDataset')
            })
        })

        describe('createDataset', () => {
            it('should create a new dataset', async () => {
                const newDataset = { name: 'New Dataset' }
                mockDatasetRepo.create.mockReturnValue(newDataset)
                mockDatasetRepo.save.mockResolvedValue({ id: 'ds-new', ...newDataset })

                const result = await service.createDataset(newDataset)

                expect(result).toHaveProperty('id', 'ds-new')
            })

            it('should throw on error', async () => {
                mockDatasetRepo.create.mockImplementation(() => {
                    throw new Error('Create error')
                })

                await expect(service.createDataset({})).rejects.toThrow('Error: datasetService.createDataset')
            })
        })

        describe('updateDataset', () => {
            it('should update an existing dataset', async () => {
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', name: 'Old' })
                mockDatasetRepo.merge.mockReturnValue({ id: 'ds-1', name: 'Updated' })
                mockDatasetRepo.save.mockResolvedValue({ id: 'ds-1', name: 'Updated' })

                const result = await service.updateDataset('ds-1', { name: 'Updated' })

                expect(result).toHaveProperty('name', 'Updated')
            })

            it('should throw when dataset not found', async () => {
                mockDatasetRepo.findOneBy.mockResolvedValue(null)

                await expect(service.updateDataset('nonexistent', {})).rejects.toThrow('Dataset nonexistent not found')
            })

            it('should throw on error', async () => {
                mockDatasetRepo.findOneBy.mockRejectedValue(new Error('DB error'))

                await expect(service.updateDataset('ds-1', {})).rejects.toThrow('Error: datasetService.updateDataset')
            })
        })

        describe('deleteDataset', () => {
            it('should delete a dataset and its rows', async () => {
                mockDatasetRepo.delete.mockResolvedValue({ affected: 1 })
                mockDatasetRowRepo.delete.mockResolvedValue({ affected: 5 })

                const result = await service.deleteDataset('ds-1')

                expect(result).toEqual({ affected: 1 })
                expect(mockDatasetRowRepo.delete).toHaveBeenCalledWith({ datasetId: 'ds-1' })
            })

            it('should throw on error', async () => {
                mockDatasetRepo.delete.mockRejectedValue(new Error('DB error'))

                await expect(service.deleteDataset('ds-1')).rejects.toThrow('Error: datasetService.deleteDataset')
            })
        })

        describe('addDatasetRow', () => {
            it('should add a new row with correct sequence number', async () => {
                mockDatasetRowRepo.find.mockResolvedValue([{ sequenceNo: 5 }])
                mockDatasetRowRepo.create.mockReturnValue({ datasetId: 'ds-1', input: 'hello', output: 'world', sequenceNo: 6 })
                mockDatasetRowRepo.save.mockResolvedValue({ id: 'row-new', datasetId: 'ds-1', input: 'hello', output: 'world', sequenceNo: 6 })
                // Mock changeUpdateOnDataset dependencies
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.addDatasetRow({ datasetId: 'ds-1', input: 'hello', output: 'world' })

                expect(result).toHaveProperty('id', 'row-new')
            })

            it('should start at 0 when no existing rows', async () => {
                mockDatasetRowRepo.find.mockResolvedValue([])
                mockDatasetRowRepo.create.mockReturnValue({ sequenceNo: 0 })
                mockDatasetRowRepo.save.mockResolvedValue({ id: 'row-new', sequenceNo: 0 })
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.addDatasetRow({ datasetId: 'ds-1', input: 'a', output: 'b' })

                expect(result).toHaveProperty('id', 'row-new')
            })

            it('should throw on error', async () => {
                mockDatasetRowRepo.find.mockRejectedValue(new Error('DB error'))

                await expect(service.addDatasetRow({ datasetId: 'ds-1' })).rejects.toThrow(
                    'Error: datasetService.createDatasetRow'
                )
            })
        })

        describe('updateDatasetRow', () => {
            it('should update a dataset row', async () => {
                mockDatasetRowRepo.findOneBy.mockResolvedValue({ id: 'row-1', input: 'old', output: 'old' })
                mockDatasetRowRepo.merge.mockReturnValue({ id: 'row-1', input: 'new', output: 'new' })
                mockDatasetRowRepo.save.mockResolvedValue({ id: 'row-1', input: 'new', output: 'new' })
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.updateDatasetRow('row-1', { datasetId: 'ds-1', input: 'new', output: 'new' })

                expect(result).toHaveProperty('input', 'new')
            })

            it('should throw when row not found', async () => {
                mockDatasetRowRepo.findOneBy.mockResolvedValue(null)

                await expect(service.updateDatasetRow('nonexistent', { datasetId: 'ds-1' })).rejects.toThrow(
                    'Dataset Row nonexistent not found'
                )
            })

            it('should throw on error', async () => {
                mockDatasetRowRepo.findOneBy.mockRejectedValue(new Error('DB error'))

                await expect(service.updateDatasetRow('row-1', { datasetId: 'ds-1' })).rejects.toThrow(
                    'Error: datasetService.updateDatasetRow'
                )
            })
        })

        describe('deleteDatasetRow', () => {
            it('should delete a dataset row via transaction', async () => {
                const mockEntityManager = {
                    getRepository: jest.fn((entity: any) => {
                        const name = typeof entity === 'function' ? entity.name : entity
                        if (name === 'DatasetRow') return mockDatasetRowRepo
                        return mockDatasetRepo
                    })
                }
                mockAppServer.AppDataSource.transaction.mockImplementation(async (cb: any) => {
                    return cb(mockEntityManager)
                })
                mockDatasetRowRepo.findOneBy.mockResolvedValue({ id: 'row-1', datasetId: 'ds-1' })
                mockDatasetRowRepo.delete.mockResolvedValue({ affected: 1 })
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.deleteDatasetRow('row-1')

                expect(result).toEqual({ affected: 1 })
            })

            it('should throw when row not found', async () => {
                const mockEntityManager = {
                    getRepository: jest.fn(() => mockDatasetRowRepo)
                }
                mockAppServer.AppDataSource.transaction.mockImplementation(async (cb: any) => {
                    return cb(mockEntityManager)
                })
                mockDatasetRowRepo.findOneBy.mockResolvedValue(null)

                await expect(service.deleteDatasetRow('nonexistent')).rejects.toThrow()
            })

            it('should throw on error', async () => {
                mockAppServer.AppDataSource.transaction.mockRejectedValue(new Error('Transaction error'))

                await expect(service.deleteDatasetRow('row-1')).rejects.toThrow('Error: datasetService.deleteDatasetRow')
            })
        })

        describe('patchDeleteRows', () => {
            it('should delete multiple rows and update parent datasets', async () => {
                mockDatasetRowRepo.find.mockResolvedValue([
                    { id: 'row-1', datasetId: 'ds-1' },
                    { id: 'row-2', datasetId: 'ds-1' }
                ])
                mockDatasetRowRepo.delete.mockResolvedValue({ affected: 2 })
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.patchDeleteRows(['row-1', 'row-2'])

                expect(result).toEqual({ affected: 2 })
            })

            it('should update multiple parent datasets', async () => {
                mockDatasetRowRepo.find.mockResolvedValue([
                    { id: 'row-1', datasetId: 'ds-1' },
                    { id: 'row-2', datasetId: 'ds-2' }
                ])
                mockDatasetRowRepo.delete.mockResolvedValue({ affected: 2 })
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                await service.patchDeleteRows(['row-1', 'row-2'])

                // Should call changeUpdateOnDataset for each unique dataset
                expect(mockDatasetRepo.findOneBy).toHaveBeenCalledTimes(2)
            })

            it('should throw on error', async () => {
                mockDatasetRowRepo.find.mockRejectedValue(new Error('DB error'))

                await expect(service.patchDeleteRows(['row-1'])).rejects.toThrow('Error: datasetService.patchDeleteRows')
            })
        })

        describe('reorderDatasetRow', () => {
            it('should reorder rows in a transaction', async () => {
                const mockEntityManager = {
                    getRepository: jest.fn((entity: any) => {
                        const name = typeof entity === 'function' ? entity.name : entity
                        if (name === 'DatasetRow') return mockDatasetRowRepo
                        return mockDatasetRepo
                    })
                }
                mockAppServer.AppDataSource.transaction.mockImplementation(async (cb: any) => {
                    return cb(mockEntityManager)
                })
                mockDatasetRowRepo.findOneBy.mockResolvedValue({ id: 'row-1', sequenceNo: 1 })
                mockDatasetRowRepo.save.mockResolvedValue({})
                mockDatasetRepo.findOneBy.mockResolvedValue({ id: 'ds-1', updatedDate: new Date() })
                mockDatasetRepo.save.mockResolvedValue({})

                const result = await service.reorderDatasetRow('ds-1', [{ id: 'row-1', sequenceNo: 3 }])

                expect(result).toEqual({ message: 'Dataset row reordered successfully' })
            })

            it('should throw when row not found during reorder', async () => {
                const mockEntityManager = {
                    getRepository: jest.fn(() => mockDatasetRowRepo)
                }
                mockAppServer.AppDataSource.transaction.mockImplementation(async (cb: any) => {
                    return cb(mockEntityManager)
                })
                mockDatasetRowRepo.findOneBy.mockResolvedValue(null)

                await expect(service.reorderDatasetRow('ds-1', [{ id: 'nonexistent', sequenceNo: 1 }])).rejects.toThrow()
            })

            it('should throw on error', async () => {
                mockAppServer.AppDataSource.transaction.mockRejectedValue(new Error('Transaction error'))

                await expect(service.reorderDatasetRow('ds-1', [])).rejects.toThrow(
                    'Error: datasetService.reorderDatasetRow'
                )
            })
        })
    })
}
