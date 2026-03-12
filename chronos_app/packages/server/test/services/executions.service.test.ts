import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for Executions service
 * Tests execution tracking operations with mocked database
 */
export function executionsServiceTest() {
    describe('Executions Service', () => {
        let executionsService: any
        let mockExecutionRepository: ReturnType<typeof createMockRepository>
        let mockChatMessageRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create fresh mocks
            mockExecutionRepository = createMockRepository()
            mockChatMessageRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockExecutionRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn((entity: any) => {
                        const entityName = typeof entity === 'function' ? entity.name : entity
                        if (entityName === 'Execution') return mockExecutionRepository
                        if (entityName === 'ChatMessage') return mockChatMessageRepository
                        return mockExecutionRepository
                    })
                }
            }

            // Setup mocks before importing service
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                _removeCredentialId: jest.fn((data: any) => data)
            }))

            // Import service after mocks are set up
            executionsService = require('../../src/services/executions').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            // Re-setup mock return values
            mockExecutionRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
        })

        describe('getExecutionById', () => {
            it('should return execution by ID', async () => {
                const mockExecution = {
                    id: 'exec-1',
                    agentflowId: 'flow-1',
                    state: 'completed',
                    executionData: '[]'
                }
                mockExecutionRepository.findOne.mockResolvedValue(mockExecution)

                const result = await executionsService.getExecutionById('exec-1')

                expect(mockExecutionRepository.findOne).toHaveBeenCalledWith({ where: { id: 'exec-1' } })
                expect(result).toEqual(mockExecution)
            })

            it('should throw NOT_FOUND error for non-existent execution', async () => {
                mockExecutionRepository.findOne.mockResolvedValue(null)

                await expect(executionsService.getExecutionById('non-existent')).rejects.toThrow('not found')
            })

            it('should throw error on database failure', async () => {
                mockExecutionRepository.findOne.mockRejectedValue(new Error('Database error'))

                await expect(executionsService.getExecutionById('exec-1')).rejects.toThrow()
            })
        })

        describe('getPublicExecutionById', () => {
            it('should return public execution by ID', async () => {
                const mockExecution = {
                    id: 'exec-1',
                    isPublic: true,
                    executionData: JSON.stringify([{ nodeId: 'node-1', data: {} }])
                }
                mockExecutionRepository.findOne.mockResolvedValue(mockExecution)

                const result = await executionsService.getPublicExecutionById('exec-1')

                expect(mockExecutionRepository.findOne).toHaveBeenCalledWith({
                    where: { id: 'exec-1', isPublic: true }
                })
                expect(result).toBeDefined()
            })

            it('should throw NOT_FOUND for non-public execution', async () => {
                mockExecutionRepository.findOne.mockResolvedValue(null)

                await expect(executionsService.getPublicExecutionById('private-exec')).rejects.toThrow('not found')
            })

            it('should handle execution data as object', async () => {
                const mockExecution = {
                    id: 'exec-1',
                    isPublic: true,
                    executionData: [{ nodeId: 'node-1', data: {} }]
                }
                mockExecutionRepository.findOne.mockResolvedValue(mockExecution)

                const result = await executionsService.getPublicExecutionById('exec-1')

                expect(result).toBeDefined()
            })

            it('should throw error on database failure', async () => {
                mockExecutionRepository.findOne.mockRejectedValue(new Error('Database error'))

                await expect(executionsService.getPublicExecutionById('exec-1')).rejects.toThrow()
            })
        })

        describe('getAllExecutions', () => {
            it('should return all executions with default pagination', async () => {
                const mockExecutions = [
                    { id: 'exec-1', state: 'completed' },
                    { id: 'exec-2', state: 'running' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockExecutions, 2])

                const result = await executionsService.getAllExecutions()

                expect(mockExecutionRepository.createQueryBuilder).toHaveBeenCalledWith('execution')
                expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('execution.agentflow', 'agentflow')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('execution.updatedDate', 'DESC')
                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(12)
                expect(result).toEqual({ data: mockExecutions, total: 2 })
            })

            it('should filter by agentflowId', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ agentflowId: 'flow-1' })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.agentflowId = :agentflowId', {
                    agentflowId: 'flow-1'
                })
            })

            it('should filter by agentflowName with case-insensitive match', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ agentflowName: 'Test Flow' })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('LOWER(agentflow.name) LIKE LOWER(:agentflowName)', {
                    agentflowName: '%Test Flow%'
                })
            })

            it('should filter by sessionId', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ sessionId: 'session-1' })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.sessionId = :sessionId', {
                    sessionId: 'session-1'
                })
            })

            it('should filter by state', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ state: 'completed' as any })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.state = :state', {
                    state: 'completed'
                })
            })

            it('should filter by date range', async () => {
                const startDate = new Date('2024-01-01')
                const endDate = new Date('2024-12-31')
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ startDate, endDate })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.createdDate BETWEEN :startDate AND :endDate', {
                    startDate,
                    endDate
                })
            })

            it('should filter by startDate only', async () => {
                const startDate = new Date('2024-01-01')
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ startDate })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.createdDate >= :startDate', {
                    startDate
                })
            })

            it('should filter by endDate only', async () => {
                const endDate = new Date('2024-12-31')
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ endDate })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.createdDate <= :endDate', {
                    endDate
                })
            })

            it('should apply custom pagination', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ page: 3, limit: 20 })

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(40)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(20)
            })

            it('should filter by execution ID', async () => {
                mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])

                await executionsService.getAllExecutions({ id: 'exec-1' })

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('execution.id = :id', { id: 'exec-1' })
            })

            it('should throw error on database failure', async () => {
                mockQueryBuilder.getManyAndCount.mockRejectedValue(new Error('Database error'))

                await expect(executionsService.getAllExecutions()).rejects.toThrow()
            })
        })

        describe('updateExecution', () => {
            it('should update existing execution', async () => {
                const existingExecution = { id: 'exec-1', state: 'running' }
                const updatedExecution = { id: 'exec-1', state: 'completed' }

                mockExecutionRepository.findOne.mockResolvedValue(existingExecution)
                mockExecutionRepository.save.mockResolvedValue(updatedExecution)

                const result = await executionsService.updateExecution('exec-1', { state: 'completed' as any })

                expect(mockExecutionRepository.findOne).toHaveBeenCalled()
                expect(mockExecutionRepository.merge).toHaveBeenCalled()
                expect(mockExecutionRepository.save).toHaveBeenCalled()
                expect(result).toEqual(updatedExecution)
            })

            it('should throw NOT_FOUND error for non-existent execution', async () => {
                mockExecutionRepository.findOne.mockResolvedValue(null)

                await expect(executionsService.updateExecution('non-existent', { state: 'completed' as any })).rejects.toThrow('not found')
            })

            it('should throw error on database failure', async () => {
                mockExecutionRepository.findOne.mockResolvedValue({ id: 'exec-1' })
                mockExecutionRepository.save.mockRejectedValue(new Error('Database error'))

                await expect(executionsService.updateExecution('exec-1', { state: 'completed' as any })).rejects.toThrow()
            })
        })

        describe('deleteExecutions', () => {
            it('should delete multiple executions by IDs', async () => {
                mockExecutionRepository.delete.mockResolvedValue({ affected: 3 })
                mockChatMessageRepository.update.mockResolvedValue({ affected: 5 })

                const result = await executionsService.deleteExecutions(['exec-1', 'exec-2', 'exec-3'])

                expect(mockExecutionRepository.delete).toHaveBeenCalled()
                expect(mockChatMessageRepository.update).toHaveBeenCalled()
                expect(result).toEqual({ success: true, deletedCount: 3 })
            })

            it('should update chat messages executionId to NULL', async () => {
                const executionIds = ['exec-1', 'exec-2']
                mockExecutionRepository.delete.mockResolvedValue({ affected: 2 })
                mockChatMessageRepository.update.mockResolvedValue({ affected: 4 })

                await executionsService.deleteExecutions(executionIds)

                expect(mockChatMessageRepository.update).toHaveBeenCalled()
            })

            it('should return deletedCount of 0 when no executions deleted', async () => {
                mockExecutionRepository.delete.mockResolvedValue({ affected: 0 })
                mockChatMessageRepository.update.mockResolvedValue({ affected: 0 })

                const result = await executionsService.deleteExecutions(['non-existent'])

                expect(result).toEqual({ success: true, deletedCount: 0 })
            })

            it('should handle undefined affected count', async () => {
                mockExecutionRepository.delete.mockResolvedValue({})
                mockChatMessageRepository.update.mockResolvedValue({})

                const result = await executionsService.deleteExecutions(['exec-1'])

                expect(result).toEqual({ success: true, deletedCount: 0 })
            })

            it('should throw error on database failure', async () => {
                mockExecutionRepository.delete.mockRejectedValue(new Error('Database error'))

                await expect(executionsService.deleteExecutions(['exec-1'])).rejects.toThrow()
            })
        })
    })
}
