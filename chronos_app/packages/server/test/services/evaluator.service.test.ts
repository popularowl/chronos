import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function evaluatorServiceTest() {
    describe('Evaluator Service', () => {
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
            jest.clearAllMocks()
            getRunningExpressAppExports.getRunningExpressApp.mockReturnValue(mockAppServer)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const service = require('../../src/services/evaluator').default

        describe('getAllEvaluators', () => {
            it('should throw on error', async () => {
                mockRepository.createQueryBuilder.mockImplementation(() => {
                    throw new Error('DB error')
                })

                await expect(service.getAllEvaluators()).rejects.toThrow('Error: evaluatorService.getAllEvaluators')
            })
        })

        describe('getEvaluator', () => {
            it('should throw when evaluator not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(service.getEvaluator('nonexistent')).rejects.toThrow('Evaluator nonexistent not found')
            })
        })

        describe('updateEvaluator', () => {
            it('should update an evaluator', async () => {
                const existingEvaluator = { id: 'eval-1', name: 'Old', type: 'llm', config: '{"prompt":"test"}' }
                mockRepository.findOneBy.mockResolvedValue(existingEvaluator)
                mockRepository.merge.mockReturnValue({ ...existingEvaluator, name: 'Updated' })
                mockRepository.save.mockResolvedValue({ id: 'eval-1', name: 'Updated', type: 'llm', config: '{"prompt":"updated"}' })

                const result = await service.updateEvaluator('eval-1', { name: 'Updated', type: 'llm', prompt: 'test prompt' })

                expect(result).toBeDefined()
            })
        })

        describe('deleteEvaluator', () => {
            it('should throw on error', async () => {
                mockRepository.delete.mockRejectedValue(new Error('DB error'))

                await expect(service.deleteEvaluator('eval-1')).rejects.toThrow('Error: evaluatorService.deleteEvaluator')
            })
        })
    })
}
