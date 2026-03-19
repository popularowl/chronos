import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

/**
 * Test suite for Schedules service
 * Tests CRUD operations with mocked database
 */
export function schedulesServiceTest() {
    describe('Schedules Service', () => {
        let schedulesService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        beforeAll(() => {
            jest.resetModules()
            process.env.ENABLE_SCHEDULES = 'true'

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                telemetry: { sendTelemetry: jest.fn() },
                metricsProvider: { incrementCounter: jest.fn() }
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                getAppVersion: jest.fn().mockResolvedValue('1.0.0')
            }))

            // Mock QueueManager so service doesn't try to access Redis
            jest.doMock('../../src/queue/QueueManager', () => ({
                QueueManager: {
                    getInstance: jest.fn().mockReturnValue({
                        getQueue: jest.fn().mockReturnValue(null)
                    })
                }
            }))

            schedulesService = require('../../src/services/schedules').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
        })

        describe('createSchedule', () => {
            it('should create a new schedule', async () => {
                const scheduleData = {
                    name: 'Daily Report',
                    cronExpression: '0 9 * * *',
                    timezone: 'UTC',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }
                const savedSchedule = { id: 'schedule-1', ...scheduleData, enabled: true }

                // findOneBy for agentflow check
                mockRepository.findOneBy.mockResolvedValue({ id: scheduleData.agentflowId })
                mockRepository.create.mockReturnValue(savedSchedule)
                mockRepository.save.mockResolvedValue(savedSchedule)

                const result = await schedulesService.createSchedule(scheduleData)

                expect(mockRepository.create).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(savedSchedule)
            })

            it('should throw error for invalid cron expression', async () => {
                const scheduleData = {
                    name: 'Bad Schedule',
                    cronExpression: 'not-a-cron',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(schedulesService.createSchedule(scheduleData)).rejects.toThrow('Invalid cron expression')
            })

            it('should throw error when agentflowId is missing', async () => {
                const scheduleData = {
                    name: 'No Flow',
                    cronExpression: '0 9 * * *'
                }

                await expect(schedulesService.createSchedule(scheduleData)).rejects.toThrow('agentflowId is required')
            })

            it('should throw error when name is missing', async () => {
                const scheduleData = {
                    cronExpression: '0 9 * * *',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                await expect(schedulesService.createSchedule(scheduleData)).rejects.toThrow('name is required')
            })

            it('should throw error when agentflow does not exist', async () => {
                const scheduleData = {
                    name: 'Missing Flow',
                    cronExpression: '0 9 * * *',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                }

                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(schedulesService.createSchedule(scheduleData)).rejects.toThrow('not found')
            })
        })

        describe('deleteSchedule', () => {
            it('should delete schedule by ID', async () => {
                const schedule = { id: 'schedule-1', cronExpression: '0 9 * * *', timezone: 'UTC' }
                mockRepository.findOneBy.mockResolvedValue(schedule)
                mockRepository.delete.mockResolvedValue({ affected: 1 })

                const result = await schedulesService.deleteSchedule('schedule-1')

                expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'schedule-1' })
                expect(result).toEqual({ affected: 1 })
            })

            it('should throw NOT_FOUND for non-existent schedule', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(schedulesService.deleteSchedule('non-existent')).rejects.toThrow('not found')
            })
        })

        describe('getAllSchedules', () => {
            it('should return all schedules without pagination', async () => {
                const mockSchedules = [
                    { id: '1', name: 'Schedule 1' },
                    { id: '2', name: 'Schedule 2' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSchedules, 2])

                const result = await schedulesService.getAllSchedules()

                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('schedule')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('schedule.updatedDate', 'DESC')
                expect(result).toEqual(mockSchedules)
            })

            it('should return paginated results', async () => {
                const mockSchedules = [{ id: '1', name: 'Schedule 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSchedules, 10])

                const result = await schedulesService.getAllSchedules(2, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ data: mockSchedules, total: 10 })
            })

            it('should filter by agentflowId', async () => {
                const mockSchedules = [{ id: '1', name: 'Schedule 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSchedules, 1])

                await schedulesService.getAllSchedules(-1, -1, 'flow-1')

                expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('schedule.agentflowId = :agentflowId', { agentflowId: 'flow-1' })
            })
        })

        describe('getScheduleById', () => {
            it('should return schedule by ID', async () => {
                const mockSchedule = { id: 'schedule-1', name: 'Test Schedule' }
                mockRepository.findOneBy.mockResolvedValue(mockSchedule)

                const result = await schedulesService.getScheduleById('schedule-1')

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'schedule-1' })
                expect(result).toEqual(mockSchedule)
            })

            it('should throw NOT_FOUND for non-existent schedule', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(schedulesService.getScheduleById('non-existent')).rejects.toThrow('not found')
            })
        })

        describe('updateSchedule', () => {
            it('should update existing schedule', async () => {
                const existingSchedule = { id: 'schedule-1', name: 'Old', cronExpression: '0 9 * * *', timezone: 'UTC', enabled: true }
                const updatedSchedule = { id: 'schedule-1', name: 'New', cronExpression: '0 9 * * *', timezone: 'UTC', enabled: true }

                mockRepository.findOneBy.mockResolvedValue(existingSchedule)
                mockRepository.save.mockResolvedValue(updatedSchedule)

                const result = await schedulesService.updateSchedule('schedule-1', { name: 'New' })

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'schedule-1' })
                expect(mockRepository.merge).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(updatedSchedule)
            })

            it('should throw NOT_FOUND for non-existent schedule', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(schedulesService.updateSchedule('non-existent', { name: 'Updated' })).rejects.toThrow('not found')
            })

            it('should reject invalid cron expression on update', async () => {
                const existingSchedule = { id: 'schedule-1', name: 'Old', cronExpression: '0 9 * * *', timezone: 'UTC' }
                mockRepository.findOneBy.mockResolvedValue(existingSchedule)

                await expect(schedulesService.updateSchedule('schedule-1', { cronExpression: 'invalid' })).rejects.toThrow(
                    'Invalid cron expression'
                )
            })
        })

        describe('toggleSchedule', () => {
            it('should toggle schedule enabled state', async () => {
                const schedule = { id: 'schedule-1', name: 'Test', cronExpression: '0 9 * * *', timezone: 'UTC', enabled: true }
                const toggled = { ...schedule, enabled: false }

                mockRepository.findOneBy.mockResolvedValue(schedule)
                mockRepository.save.mockResolvedValue(toggled)

                const result = await schedulesService.toggleSchedule('schedule-1', false)

                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(toggled)
            })

            it('should throw NOT_FOUND for non-existent schedule', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(schedulesService.toggleSchedule('non-existent', false)).rejects.toThrow('not found')
            })
        })

        describe('scheduling disabled guard', () => {
            it('should reject create when ENABLE_SCHEDULES is not true', async () => {
                const original = process.env.ENABLE_SCHEDULES
                process.env.ENABLE_SCHEDULES = 'false'

                // Need to re-require to pick up env change
                jest.resetModules()
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                jest.doMock('../../src/utils', () => ({
                    getAppVersion: jest.fn().mockResolvedValue('1.0.0')
                }))
                jest.doMock('../../src/queue/QueueManager', () => ({
                    QueueManager: {
                        getInstance: jest.fn().mockReturnValue({
                            getQueue: jest.fn().mockReturnValue(null)
                        })
                    }
                }))
                const svc = require('../../src/services/schedules').default

                await expect(svc.createSchedule({ name: 'Test', cronExpression: '0 * * * *', agentflowId: 'x' })).rejects.toThrow(
                    'not enabled'
                )

                process.env.ENABLE_SCHEDULES = original
                jest.resetModules()
                // Re-require the original service
                jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                    getRunningExpressApp: jest.fn(() => mockAppServer)
                }))
                jest.doMock('../../src/utils', () => ({
                    getAppVersion: jest.fn().mockResolvedValue('1.0.0')
                }))
                jest.doMock('../../src/queue/QueueManager', () => ({
                    QueueManager: {
                        getInstance: jest.fn().mockReturnValue({
                            getQueue: jest.fn().mockReturnValue(null)
                        })
                    }
                }))
                schedulesService = require('../../src/services/schedules').default
            })
        })

        describe('inputPayload validation', () => {
            it('should reject invalid JSON inputPayload', async () => {
                const scheduleData = {
                    name: 'Bad Payload',
                    cronExpression: '0 9 * * *',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    inputPayload: 'not-json'
                }

                mockRepository.findOneBy.mockResolvedValue({ id: scheduleData.agentflowId })

                await expect(schedulesService.createSchedule(scheduleData)).rejects.toThrow('valid JSON')
            })

            it('should accept valid JSON inputPayload', async () => {
                const scheduleData = {
                    name: 'Good Payload',
                    cronExpression: '0 9 * * *',
                    agentflowId: '550e8400-e29b-41d4-a716-446655440000',
                    inputPayload: '{"question": "test"}'
                }
                const savedSchedule = { id: 'schedule-1', ...scheduleData, enabled: true }

                mockRepository.findOneBy.mockResolvedValue({ id: scheduleData.agentflowId })
                mockRepository.create.mockReturnValue(savedSchedule)
                mockRepository.save.mockResolvedValue(savedSchedule)

                const result = await schedulesService.createSchedule(scheduleData)
                expect(result).toEqual(savedSchedule)
            })
        })

        describe('getScheduleExecutions', () => {
            it('should return executions for a schedule', async () => {
                const mockExecutions = [{ id: 'exec-1', scheduleId: 'schedule-1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockExecutions, 1])

                const result = await schedulesService.getScheduleExecutions('schedule-1')

                expect(mockQueryBuilder.where).toHaveBeenCalledWith('execution.scheduleId = :scheduleId', { scheduleId: 'schedule-1' })
                expect(result).toEqual(mockExecutions)
            })

            it('should return paginated execution results', async () => {
                const mockExecutions = [{ id: 'exec-1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockExecutions, 10])

                const result = await schedulesService.getScheduleExecutions('schedule-1', 1, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ data: mockExecutions, total: 10 })
            })
        })
    })
}
