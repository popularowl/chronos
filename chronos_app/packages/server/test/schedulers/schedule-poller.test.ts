/**
 * Test suite for SchedulePoller (DB polling scheduler)
 * Tests claim logic, poll cycle, and double-fire prevention
 */
export function schedulePollerTest() {
    describe('SchedulePoller', () => {
        let SchedulePoller: any
        let mockDataSource: any
        let mockScheduleRepo: any
        let mockAgentflowRepo: any
        let mockExecutionRepo: any
        let mockQueryBuilder: any

        beforeAll(() => {
            jest.resetModules()

            // Mock executeFlow
            jest.doMock('../../src/utils/buildAgentflow', () => ({
                executeFlow: jest.fn().mockResolvedValue({ text: 'result' })
            }))

            // Mock SSEStreamer
            jest.doMock('../../src/utils/SSEStreamer', () => ({
                SSEStreamer: jest.fn().mockImplementation(() => ({}))
            }))

            // Mock logger
            jest.doMock('../../src/utils/logger', () => ({
                default: {
                    info: jest.fn(),
                    error: jest.fn(),
                    warn: jest.fn(),
                    debug: jest.fn()
                }
            }))

            SchedulePoller = require('../../src/schedulers/SchedulePoller').SchedulePoller
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()

            mockQueryBuilder = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 1 })
            }

            mockScheduleRepo = {
                find: jest.fn().mockResolvedValue([]),
                findOneBy: jest.fn(),
                update: jest.fn().mockResolvedValue({ affected: 1 }),
                createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder)
            }

            mockAgentflowRepo = {
                findOneBy: jest.fn()
            }

            mockExecutionRepo = {
                update: jest.fn().mockResolvedValue({ affected: 1 })
            }

            mockDataSource = {
                getRepository: jest.fn((entity: any) => {
                    const name = entity.name || entity
                    if (name === 'Schedule') return mockScheduleRepo
                    if (name === 'AgentFlow') return mockAgentflowRepo
                    if (name === 'Execution') return mockExecutionRepo
                    return mockScheduleRepo
                })
            }
        })

        const createPoller = () => {
            return new SchedulePoller({
                appDataSource: mockDataSource,
                componentNodes: {},
                telemetry: { sendTelemetry: jest.fn() },
                cachePool: {},
                usageCacheManager: {}
            })
        }

        describe('start/stop', () => {
            it('should start and stop without errors', () => {
                const poller = createPoller()
                poller.start()
                expect(poller['intervalId']).not.toBeNull()
                poller.stop()
                expect(poller['intervalId']).toBeNull()
            })

            it('should not start twice', () => {
                const poller = createPoller()
                poller.start()
                const firstInterval = poller['intervalId']
                poller.start()
                expect(poller['intervalId']).toBe(firstInterval)
                poller.stop()
            })
        })

        describe('poll', () => {
            it('should query for due schedules', async () => {
                const poller = createPoller()
                await poller['poll']()

                expect(mockDataSource.getRepository).toHaveBeenCalled()
                expect(mockScheduleRepo.find).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            enabled: true
                        })
                    })
                )
            })

            it('should not overlap polls', async () => {
                const poller = createPoller()
                poller['running'] = true
                await poller['poll']()

                // Should have returned immediately without querying
                expect(mockScheduleRepo.find).not.toHaveBeenCalled()
            })

            it('should reset running flag after poll completes', async () => {
                const poller = createPoller()
                await poller['poll']()
                expect(poller['running']).toBe(false)
            })

            it('should reset running flag even on error', async () => {
                mockScheduleRepo.find.mockRejectedValue(new Error('DB error'))
                const poller = createPoller()
                await poller['poll']()
                expect(poller['running']).toBe(false)
            })
        })

        describe('tryClaimSchedule (optimistic locking)', () => {
            it('should claim schedule when UPDATE affects 1 row', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 1 })
                const poller = createPoller()

                const schedule = {
                    id: 'sched-1',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    nextRunDate: new Date('2026-01-01T00:00:00Z')
                }

                const result = await poller['tryClaimSchedule'](schedule)
                expect(result).toBeInstanceOf(Date)
                expect(result!.getTime()).toBeGreaterThan(schedule.nextRunDate.getTime())
            })

            it('should return null when another instance already claimed', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 0 })
                const poller = createPoller()

                const schedule = {
                    id: 'sched-1',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    nextRunDate: new Date('2026-01-01T00:00:00Z')
                }

                const result = await poller['tryClaimSchedule'](schedule)
                expect(result).toBeNull()
            })

            it('should disable schedule with invalid cron and return null', async () => {
                const poller = createPoller()

                const schedule = {
                    id: 'sched-bad',
                    cronExpression: 'not-valid-cron',
                    timezone: 'UTC',
                    nextRunDate: new Date()
                }

                const result = await poller['tryClaimSchedule'](schedule)
                expect(result).toBeNull()
                expect(mockScheduleRepo.update).toHaveBeenCalledWith('sched-bad', { enabled: false })
            })
        })

        describe('executeSchedule', () => {
            it('should skip execution when claim fails', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 0 })
                const poller = createPoller()
                const { executeFlow } = require('../../src/utils/buildAgentflow')

                const schedule = {
                    id: 'sched-1',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    agentflowId: 'flow-1',
                    nextRunDate: new Date()
                }

                await poller['executeSchedule'](schedule)

                // executeFlow should NOT have been called
                expect(executeFlow).not.toHaveBeenCalled()
            })

            it('should update lastRunStatus to ERROR when agentflow not found', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 1 })
                mockAgentflowRepo.findOneBy.mockResolvedValue(null)
                const poller = createPoller()

                const schedule = {
                    id: 'sched-1',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    agentflowId: 'missing-flow',
                    nextRunDate: new Date()
                }

                await poller['executeSchedule'](schedule)

                expect(mockScheduleRepo.update).toHaveBeenCalledWith(
                    'sched-1',
                    expect.objectContaining({
                        lastRunStatus: 'ERROR'
                    })
                )
            })

            it('should execute flow and update schedule on success', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 1 })
                mockAgentflowRepo.findOneBy.mockResolvedValue({ id: 'flow-1', name: 'Test Flow', flowData: '{}' })
                const poller = createPoller()
                const { executeFlow } = require('../../src/utils/buildAgentflow')

                const schedule = {
                    id: 'sched-1',
                    name: 'Test Schedule',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    agentflowId: 'flow-1',
                    inputPayload: null,
                    nextRunDate: new Date()
                }

                await poller['executeSchedule'](schedule)

                expect(executeFlow).toHaveBeenCalled()
                expect(mockScheduleRepo.update).toHaveBeenCalledWith(
                    'sched-1',
                    expect.objectContaining({
                        lastRunStatus: 'FINISHED'
                    })
                )
            })

            it('should mark ERROR when executeFlow throws', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 1 })
                mockAgentflowRepo.findOneBy.mockResolvedValue({ id: 'flow-1', name: 'Test Flow', flowData: '{}' })
                const { executeFlow } = require('../../src/utils/buildAgentflow')
                executeFlow.mockRejectedValueOnce(new Error('Flow failed'))
                const poller = createPoller()

                const schedule = {
                    id: 'sched-1',
                    name: 'Failing Schedule',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    agentflowId: 'flow-1',
                    inputPayload: null,
                    nextRunDate: new Date()
                }

                await poller['executeSchedule'](schedule)

                expect(mockScheduleRepo.update).toHaveBeenCalledWith(
                    'sched-1',
                    expect.objectContaining({
                        lastRunStatus: 'ERROR'
                    })
                )
            })

            it('should parse inputPayload JSON', async () => {
                mockQueryBuilder.execute.mockResolvedValue({ affected: 1 })
                mockAgentflowRepo.findOneBy.mockResolvedValue({ id: 'flow-1', name: 'Test Flow', flowData: '{}' })
                const { executeFlow } = require('../../src/utils/buildAgentflow')
                const poller = createPoller()

                const schedule = {
                    id: 'sched-1',
                    name: 'Payload Schedule',
                    cronExpression: '*/5 * * * *',
                    timezone: 'UTC',
                    agentflowId: 'flow-1',
                    inputPayload: '{"question": "daily report"}',
                    nextRunDate: new Date()
                }

                await poller['executeSchedule'](schedule)

                expect(executeFlow).toHaveBeenCalledWith(
                    expect.objectContaining({
                        incomingInput: expect.objectContaining({
                            question: 'daily report'
                        })
                    })
                )
            })
        })
    })
}
