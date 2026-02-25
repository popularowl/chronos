import { createMockRepository, createMockQueryBuilder, createMockIdentityManager, createMockTelemetry } from '../mocks/appServer.mock'
import { Variable } from '../../src/database/entities/Variable'
import { Platform } from '../../src/Interface'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function variablesServiceTest() {
    describe('Variables Service', () => {
        const mockRepository = createMockRepository()
        const mockQueryBuilder = createMockQueryBuilder()
        mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

        const mockIdentityManager = createMockIdentityManager(Platform.OPEN_SOURCE)
        const mockTelemetry = createMockTelemetry()

        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            },
            identityManager: mockIdentityManager,
            telemetry: mockTelemetry
        }

        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockIdentityManager.getPlatformType.mockReturnValue(Platform.OPEN_SOURCE)
            // Reset mocks
            mockQueryBuilder.getManyAndCount.mockReset()
            mockQueryBuilder.getMany.mockReset()
            mockQueryBuilder.andWhere.mockClear()
            mockQueryBuilder.skip.mockClear()
            mockQueryBuilder.take.mockClear()
            mockRepository.findOneBy.mockReset()
            mockRepository.create.mockReset()
            mockRepository.create.mockImplementation((entity: any) => entity)
            mockRepository.save.mockReset()
            mockRepository.delete.mockReset()
            mockRepository.merge.mockReset()
            mockRepository.merge.mockImplementation((target: any, source: any) => ({ ...target, ...source }))
            mockRepository.insert.mockReset()
            mockTelemetry.sendTelemetry.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const variablesService = require('../../src/services/variables').default

        describe('createVariable', () => {
            it('should create a new variable', async () => {
                const newVariable = { id: 'var-1', name: 'API_KEY', value: 'secret-value', type: 'static' } as Variable
                mockRepository.create.mockReturnValue(newVariable)
                mockRepository.save.mockResolvedValue(newVariable)

                const result = await variablesService.createVariable(newVariable, 'org-123')

                expect(result).toEqual(newVariable)
                expect(mockRepository.create).toHaveBeenCalledWith(newVariable)
                expect(mockRepository.save).toHaveBeenCalled()
                expect(mockTelemetry.sendTelemetry).toHaveBeenCalledWith(
                    'variable_created',
                    expect.objectContaining({ variableType: 'static' }),
                    'org-123'
                )
            })

            it('should throw error for runtime variables on cloud platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.CLOUD)
                const runtimeVariable = { name: 'RUNTIME_VAR', value: 'value', type: 'runtime' } as Variable
                await expect(variablesService.createVariable(runtimeVariable, 'org-123')).rejects.toThrow(
                    'Cloud platform does not support runtime variables'
                )
            })

            it('should allow runtime variables on open source platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.OPEN_SOURCE)
                const runtimeVariable = { name: 'RUNTIME_VAR', value: 'value', type: 'runtime' } as Variable
                mockRepository.create.mockReturnValue(runtimeVariable)
                mockRepository.save.mockResolvedValue(runtimeVariable)

                const result = await variablesService.createVariable(runtimeVariable, 'org-123')

                expect(result).toEqual(runtimeVariable)
            })
        })

        describe('deleteVariable', () => {
            it('should delete variable by ID', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 1 })
                const result = await variablesService.deleteVariable('var-123')
                expect(result).toEqual({ affected: 1 })
                expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'var-123' })
            })

            it('should handle delete of non-existent variable', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 0 })
                const result = await variablesService.deleteVariable('non-existent')
                expect(result).toEqual({ affected: 0 })
            })
        })

        describe('getAllVariables', () => {
            it('should return all variables', async () => {
                const mockVariables = [
                    { id: '1', name: 'VAR1', value: 'value1', type: 'static' },
                    { id: '2', name: 'VAR2', value: 'value2', type: 'static' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockVariables, 2])

                const result = await variablesService.getAllVariables()

                expect(Array.isArray(result)).toBe(true)
                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('variable')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('variable.updatedDate', 'DESC')
            })

            it('should return paginated results', async () => {
                const mockVariables = [{ id: '1', name: 'VAR1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockVariables, 10])

                const result = await variablesService.getAllVariables(2, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toHaveProperty('data')
                expect(result).toHaveProperty('total', 10)
            })

            it('should filter out runtime variables on cloud platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.CLOUD)
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await variablesService.getAllVariables()

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('variable.type != :type', { type: 'runtime' })
            })

            it('should not filter runtime variables on open source platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.OPEN_SOURCE)
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await variablesService.getAllVariables()

                expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled()
            })
        })

        describe('getVariableById', () => {
            it('should return variable by ID', async () => {
                const mockVariable = { id: 'var-1', name: 'TEST_VAR', type: 'static' }
                mockRepository.findOneBy.mockResolvedValue(mockVariable)

                const result = await variablesService.getVariableById('var-1')

                expect(result).toEqual(mockVariable)
                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'var-1' })
            })

            it('should return null when variable not found', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)
                const result = await variablesService.getVariableById('non-existent')
                expect(result).toBeNull()
            })

            it('should throw error for runtime variable on cloud platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.CLOUD)
                mockRepository.findOneBy.mockResolvedValue({ id: 'var-1', type: 'runtime' })
                await expect(variablesService.getVariableById('var-1')).rejects.toThrow('Cloud platform does not support runtime variables')
            })
        })

        describe('updateVariable', () => {
            it('should update variable', async () => {
                const existingVariable = { id: 'var-1', name: 'OLD_NAME', type: 'static' } as Variable
                const updatedData = { name: 'NEW_NAME', type: 'static' } as Variable
                const mergedVariable = { ...existingVariable, ...updatedData }
                mockRepository.merge.mockReturnValue(mergedVariable)
                mockRepository.save.mockResolvedValue(mergedVariable)

                const result = await variablesService.updateVariable(existingVariable, updatedData)

                expect(result).toEqual(mergedVariable)
                expect(mockRepository.merge).toHaveBeenCalledWith(existingVariable, updatedData)
                expect(mockRepository.save).toHaveBeenCalledWith(mergedVariable)
            })

            it('should throw error for runtime variable update on cloud platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.CLOUD)
                const existingVariable = { id: 'var-1', name: 'VAR', type: 'static' } as Variable
                const updatedData = { type: 'runtime' } as Variable
                await expect(variablesService.updateVariable(existingVariable, updatedData)).rejects.toThrow(
                    'Cloud platform does not support runtime variables'
                )
            })
        })

        describe('importVariables', () => {
            it('should import new variables', async () => {
                const newVariables = [
                    { id: '550e8400-e29b-41d4-a716-446655440010', name: 'VAR1', value: 'val1', type: 'static' },
                    { id: '550e8400-e29b-41d4-a716-446655440011', name: 'VAR2', value: 'val2', type: 'static' }
                ]
                mockQueryBuilder.getMany.mockResolvedValue([])
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: '550e8400-e29b-41d4-a716-446655440010' }, { id: '550e8400-e29b-41d4-a716-446655440011' }] })

                await variablesService.importVariables(newVariables as Partial<Variable>[])

                expect(mockRepository.insert).toHaveBeenCalled()
            })

            it('should handle empty array', async () => {
                const result = await variablesService.importVariables([])
                expect(mockRepository.insert).not.toHaveBeenCalled()
                expect(result).toBeUndefined()
            })

            it('should throw error for invalid UUID', async () => {
                const invalidVariables = [{ id: 'not-a-valid-uuid', name: 'VAR', value: 'val', type: 'static' }]
                await expect(variablesService.importVariables(invalidVariables as Partial<Variable>[])).rejects.toThrow('invalid id')
            })

            it('should rename duplicate variables', async () => {
                const variables = [{ id: '550e8400-e29b-41d4-a716-446655440020', name: 'VAR1', value: 'val1', type: 'static' }]
                mockQueryBuilder.getMany.mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440020' }])
                mockRepository.insert.mockResolvedValue({ identifiers: [] })

                await variablesService.importVariables(variables as Partial<Variable>[])

                expect(mockRepository.insert).toHaveBeenCalledWith(
                    expect.arrayContaining([expect.objectContaining({ name: 'VAR1 (1)', id: undefined })])
                )
            })

            it('should filter runtime variables on cloud platform', async () => {
                mockIdentityManager.getPlatformType.mockReturnValue(Platform.CLOUD)
                const variables = [
                    { id: '550e8400-e29b-41d4-a716-446655440000', name: 'STATIC_VAR', type: 'static' },
                    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'RUNTIME_VAR', type: 'runtime' }
                ]
                mockQueryBuilder.getMany.mockResolvedValue([])
                mockRepository.insert.mockResolvedValue({ identifiers: [] })

                await variablesService.importVariables(variables as Partial<Variable>[])

                expect(mockRepository.insert).toHaveBeenCalledWith(
                    expect.arrayContaining([expect.objectContaining({ name: 'STATIC_VAR' })])
                )
                const insertCall = mockRepository.insert.mock.calls[0][0]
                expect(insertCall.find((v: any) => v.type === 'runtime')).toBeUndefined()
            })
        })
    })
}
