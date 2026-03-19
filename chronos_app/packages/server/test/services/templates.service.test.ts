/**
 * Test suite for Templates service
 * Tests custom template CRUD operations with mocked database
 * Note: getAllTemplates tests are skipped as they require filesystem mocking
 * which is complex with native Node.js modules
 */
export function templatesServiceTest() {
    describe('Templates Service', () => {
        let templatesService: any
        let mockGetRunningExpressApp: jest.Mock
        let mockCustomTemplateRepository: any

        beforeAll(() => {
            // Reset modules to ensure clean state
            jest.resetModules()

            // Create mock repository
            mockCustomTemplateRepository = {
                find: jest.fn(),
                delete: jest.fn(),
                create: jest.fn((entity: any) => entity),
                save: jest.fn()
            }

            // Create mock app server
            mockGetRunningExpressApp = jest.fn().mockReturnValue({
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockCustomTemplateRepository)
                }
            })

            // Setup mocks before importing service
            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: () => mockGetRunningExpressApp()
            }))

            // Import service after mocks are set up
            templatesService = require('../../src/services/templates').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
        })

        describe('deleteCustomTemplate', () => {
            it('should delete template by ID', async () => {
                mockCustomTemplateRepository.delete.mockResolvedValue({ affected: 1 })

                const result = await templatesService.deleteCustomTemplate('template-123')

                expect(result).toEqual({ affected: 1 })
                expect(mockCustomTemplateRepository.delete).toHaveBeenCalledWith({ id: 'template-123' })
            })

            it('should return affected 0 for non-existent template', async () => {
                mockCustomTemplateRepository.delete.mockResolvedValue({ affected: 0 })

                const result = await templatesService.deleteCustomTemplate('non-existent')

                expect(result).toEqual({ affected: 0 })
            })

            it('should throw error on database failure', async () => {
                mockCustomTemplateRepository.delete.mockRejectedValue(new Error('Database error'))

                await expect(templatesService.deleteCustomTemplate('template-123')).rejects.toThrow()
            })
        })

        describe('getAllCustomTemplates', () => {
            it('should return all custom templates', async () => {
                const mockTemplates = [
                    {
                        id: 'ct-1',
                        name: 'Custom Agentflow',
                        type: 'Agentflow',
                        flowData: JSON.stringify({ nodes: [{ data: { category: 'LLMs' } }], edges: [] }),
                        usecases: JSON.stringify(['chatbot']),
                        badge: 'NEW',
                        framework: 'Langchain'
                    }
                ]
                mockCustomTemplateRepository.find.mockResolvedValue(mockTemplates)

                const result = await templatesService.getAllCustomTemplates()

                expect(result).toHaveLength(1)
                expect(mockCustomTemplateRepository.find).toHaveBeenCalled()
            })

            it('should parse usecases JSON string', async () => {
                const mockTemplates = [
                    {
                        id: 'ct-1',
                        type: 'Agentflow',
                        flowData: JSON.stringify({ nodes: [], edges: [] }),
                        usecases: JSON.stringify(['chatbot', 'qa'])
                    }
                ]
                mockCustomTemplateRepository.find.mockResolvedValue(mockTemplates)

                const result = await templatesService.getAllCustomTemplates()

                expect(result[0].usecases).toEqual(['chatbot', 'qa'])
            })

            it('should handle Tool type templates', async () => {
                const mockTemplates = [
                    {
                        id: 'ct-1',
                        type: 'Tool',
                        flowData: JSON.stringify({
                            iconSrc: 'icon.png',
                            schema: '{}',
                            func: 'return true'
                        }),
                        usecases: null
                    }
                ]
                mockCustomTemplateRepository.find.mockResolvedValue(mockTemplates)

                const result = await templatesService.getAllCustomTemplates()

                expect(result[0].iconSrc).toBe('icon.png')
                expect(result[0].schema).toBe('{}')
                expect(result[0].func).toBe('return true')
                expect(result[0].categories).toEqual([])
                expect(result[0].flowData).toBeUndefined()
            })

            it('should set default badge and framework if missing', async () => {
                const mockTemplates = [
                    {
                        id: 'ct-1',
                        type: 'Agentflow',
                        flowData: JSON.stringify({ nodes: [], edges: [] }),
                        usecases: null,
                        badge: null,
                        framework: null
                    }
                ]
                mockCustomTemplateRepository.find.mockResolvedValue(mockTemplates)

                const result = await templatesService.getAllCustomTemplates()

                expect(result[0].badge).toBe('')
                expect(result[0].framework).toBe('')
            })

            it('should return empty array when no templates exist', async () => {
                mockCustomTemplateRepository.find.mockResolvedValue([])

                const result = await templatesService.getAllCustomTemplates()

                expect(result).toEqual([])
            })

            it('should throw error on database failure', async () => {
                mockCustomTemplateRepository.find.mockRejectedValue(new Error('Database error'))

                await expect(templatesService.getAllCustomTemplates()).rejects.toThrow()
            })

            it('should work with no parameters', async () => {
                mockCustomTemplateRepository.find.mockResolvedValue([])

                await templatesService.getAllCustomTemplates()

                expect(mockCustomTemplateRepository.find).toHaveBeenCalled()
            })
        })

        describe('saveCustomTemplate', () => {
            it('should save a Tool template', async () => {
                const toolBody = {
                    name: 'My Tool',
                    tool: {
                        iconSrc: 'tool.png',
                        schema: '{ "type": "object" }',
                        func: 'return input'
                    },
                    usecases: ['utility']
                }
                const savedTemplate = { id: 'new-1', ...toolBody }
                mockCustomTemplateRepository.save.mockResolvedValue(savedTemplate)

                const result = await templatesService.saveCustomTemplate(toolBody)

                expect(result).toEqual(savedTemplate)
                expect(mockCustomTemplateRepository.create).toHaveBeenCalled()
                expect(mockCustomTemplateRepository.save).toHaveBeenCalled()
            })

            it('should stringify usecases array', async () => {
                const body = {
                    name: 'Template',
                    usecases: ['chatbot', 'qa'],
                    tool: { iconSrc: '', schema: '', func: '' }
                }
                mockCustomTemplateRepository.save.mockResolvedValue({ id: 'new-1' })

                await templatesService.saveCustomTemplate(body)

                const createCall = mockCustomTemplateRepository.create.mock.calls[0][0]
                expect(createCall.usecases).toBe(JSON.stringify(['chatbot', 'qa']))
            })

            it('should throw error on database failure', async () => {
                mockCustomTemplateRepository.save.mockRejectedValue(new Error('Save failed'))

                await expect(
                    templatesService.saveCustomTemplate({
                        tool: { iconSrc: '', schema: '', func: '' }
                    })
                ).rejects.toThrow()
            })
        })
    })
}
