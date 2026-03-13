import { createMockRepository, createMockQueryBuilder, createMockTelemetry } from '../mocks/appServer.mock'

/**
 * Test suite for Skills service
 * Tests CRUD operations with mocked database
 */
export function skillsServiceTest() {
    describe('Skills Service', () => {
        let skillsService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockTelemetry: ReturnType<typeof createMockTelemetry>
        let mockMetricsProvider: any
        let mockAppServer: any

        beforeAll(() => {
            jest.resetModules()

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockTelemetry = createMockTelemetry()
            mockMetricsProvider = {
                incrementCounter: jest.fn()
            }

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                telemetry: mockTelemetry,
                metricsProvider: mockMetricsProvider
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                getAppVersion: jest.fn().mockResolvedValue('1.0.0')
            }))

            skillsService = require('../../src/services/skills').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
        })

        describe('createSkill', () => {
            it('should create a new skill', async () => {
                const skillData = {
                    name: 'Test Skill',
                    description: 'Test description',
                    category: 'development',
                    color: '#4DD0E1',
                    content: '## Test Skill\n\nInstructions here.'
                }
                const savedSkill = { id: 'skill-1', ...skillData }

                mockRepository.create.mockReturnValue(savedSkill)
                mockRepository.save.mockResolvedValue(savedSkill)

                const result = await skillsService.createSkill(skillData, 'org-1')

                expect(mockRepository.create).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(savedSkill)
            })

            it('should send telemetry on skill creation', async () => {
                const skillData = { name: 'Telemetry Skill', content: '## Skill' }
                const savedSkill = { id: 'skill-2', ...skillData }

                mockRepository.create.mockReturnValue(savedSkill)
                mockRepository.save.mockResolvedValue(savedSkill)

                await skillsService.createSkill(skillData, 'org-1')

                expect(mockTelemetry.sendTelemetry).toHaveBeenCalledWith(
                    'skill_created',
                    expect.objectContaining({
                        skillId: 'skill-2',
                        skillName: 'Telemetry Skill'
                    }),
                    'org-1'
                )
            })

            it('should increment metrics counter on success', async () => {
                const skillData = { name: 'Metrics Skill', content: '## Skill' }
                const savedSkill = { id: 'skill-3', ...skillData }

                mockRepository.create.mockReturnValue(savedSkill)
                mockRepository.save.mockResolvedValue(savedSkill)

                await skillsService.createSkill(skillData, 'org-1')

                expect(mockMetricsProvider.incrementCounter).toHaveBeenCalled()
            })

            it('should throw error on database failure', async () => {
                mockRepository.create.mockImplementation(() => {
                    throw new Error('Database error')
                })

                await expect(skillsService.createSkill({}, 'org-1')).rejects.toThrow()
            })
        })

        describe('deleteSkill', () => {
            it('should delete skill by ID', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 1 })

                const result = await skillsService.deleteSkill('skill-1')

                expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'skill-1' })
                expect(result).toEqual({ affected: 1 })
            })

            it('should handle non-existent skill deletion', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 0 })

                const result = await skillsService.deleteSkill('non-existent')

                expect(result).toEqual({ affected: 0 })
            })

            it('should throw error on database failure', async () => {
                mockRepository.delete.mockRejectedValue(new Error('Database error'))

                await expect(skillsService.deleteSkill('skill-1')).rejects.toThrow()
            })
        })

        describe('getAllSkills', () => {
            it('should return all skills without pagination', async () => {
                const mockSkills = [
                    { id: '1', name: 'Skill 1', category: 'general' },
                    { id: '2', name: 'Skill 2', category: 'development' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSkills, 2])

                const result = await skillsService.getAllSkills()

                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('skill')
                expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('skill.updatedDate', 'DESC')
                expect(result).toEqual(mockSkills)
            })

            it('should return paginated results', async () => {
                const mockSkills = [{ id: '1', name: 'Skill 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSkills, 10])

                const result = await skillsService.getAllSkills(2, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toEqual({ data: mockSkills, total: 10 })
            })

            it('should not paginate with invalid page/limit', async () => {
                const mockSkills = [{ id: '1', name: 'Skill 1' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValue([mockSkills, 1])

                const result = await skillsService.getAllSkills(-1, -1)

                expect(mockQueryBuilder.skip).not.toHaveBeenCalled()
                expect(mockQueryBuilder.take).not.toHaveBeenCalled()
                expect(result).toEqual(mockSkills)
            })

            it('should throw error on database failure', async () => {
                mockQueryBuilder.getManyAndCount.mockRejectedValue(new Error('Database error'))

                await expect(skillsService.getAllSkills()).rejects.toThrow()
            })
        })

        describe('getSkillById', () => {
            it('should return skill by ID', async () => {
                const mockSkill = { id: 'skill-1', name: 'Test Skill', content: '## Skill' }
                mockRepository.findOneBy.mockResolvedValue(mockSkill)

                const result = await skillsService.getSkillById('skill-1')

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'skill-1' })
                expect(result).toEqual(mockSkill)
            })

            it('should throw NOT_FOUND error for non-existent skill', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(skillsService.getSkillById('non-existent')).rejects.toThrow('not found')
            })

            it('should throw error on database failure', async () => {
                mockRepository.findOneBy.mockRejectedValue(new Error('Database error'))

                await expect(skillsService.getSkillById('skill-1')).rejects.toThrow()
            })
        })

        describe('updateSkill', () => {
            it('should update existing skill', async () => {
                const existingSkill = { id: 'skill-1', name: 'Old Name', content: '## Old' }
                const updatedSkill = { id: 'skill-1', name: 'New Name', content: '## New' }

                mockRepository.findOneBy.mockResolvedValue(existingSkill)
                mockRepository.save.mockResolvedValue(updatedSkill)

                const result = await skillsService.updateSkill('skill-1', { name: 'New Name', content: '## New' })

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'skill-1' })
                expect(mockRepository.merge).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
                expect(result).toEqual(updatedSkill)
            })

            it('should throw NOT_FOUND error for non-existent skill', async () => {
                mockRepository.findOneBy.mockResolvedValue(null)

                await expect(skillsService.updateSkill('non-existent', { name: 'Updated' })).rejects.toThrow('not found')
            })

            it('should throw error on database failure', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: 'skill-1' })
                mockRepository.save.mockRejectedValue(new Error('Database error'))

                await expect(skillsService.updateSkill('skill-1', { name: 'Updated' })).rejects.toThrow()
            })
        })

        describe('importSkills', () => {
            it('should return early for empty skills array', async () => {
                const result = await skillsService.importSkills([])

                expect(mockRepository.insert).not.toHaveBeenCalled()
                expect(result).toBeUndefined()
            })

            it('should throw error for invalid skill ID', async () => {
                const invalidSkills = [{ id: 'invalid-uuid', name: 'Skill' }]

                await expect(skillsService.importSkills(invalidSkills)).rejects.toThrow('invalid id')
            })

            it('should import skills with valid UUIDs', async () => {
                const validSkills = [
                    { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Skill 1', content: '## Skill 1' },
                    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Skill 2', content: '## Skill 2' }
                ]

                mockQueryBuilder.getMany.mockResolvedValue([])
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: '1' }, { id: '2' }] })

                const result = await skillsService.importSkills(validSkills)

                expect(mockRepository.insert).toHaveBeenCalled()
                expect(result).toBeDefined()
            })

            it('should handle duplicate IDs by renaming skills', async () => {
                const skills = [{ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Skill 1', content: '## Skill' }]

                mockQueryBuilder.getMany.mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440000' }])
                mockRepository.insert.mockResolvedValue({ identifiers: [{ id: 'new-id' }] })

                await skillsService.importSkills(skills)

                expect(mockRepository.insert).toHaveBeenCalled()
            })

            it('should throw error on database failure', async () => {
                const validSkills = [{ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Skill', content: '## Skill' }]

                mockQueryBuilder.getMany.mockResolvedValue([])
                mockRepository.insert.mockRejectedValue(new Error('Database error'))

                await expect(skillsService.importSkills(validSkills)).rejects.toThrow()
            })
        })
    })
}
