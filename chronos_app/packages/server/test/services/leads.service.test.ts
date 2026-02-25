import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function leadsServiceTest() {
    describe('Leads Service', () => {
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
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const leadsService = require('../../src/services/leads').default

        describe('getAllLeads', () => {
            it('should return all leads for a chatflow', async () => {
                const mockLeads = [
                    { id: 'lead-1', chatflowid: 'flow-1', name: 'John Doe', email: 'john@example.com' },
                    { id: 'lead-2', chatflowid: 'flow-1', name: 'Jane Doe', email: 'jane@example.com' }
                ]
                mockRepository.find.mockResolvedValue(mockLeads)

                const result = await leadsService.getAllLeads('flow-1')

                expect(result).toEqual(mockLeads)
                expect(mockRepository.find).toHaveBeenCalledWith({ where: { chatflowid: 'flow-1' } })
            })

            it('should return empty array when no leads found', async () => {
                mockRepository.find.mockResolvedValue([])
                const result = await leadsService.getAllLeads('flow-1')
                expect(result).toEqual([])
            })

            it('should throw InternalChronosError on database error', async () => {
                mockRepository.find.mockRejectedValue(new Error('Database error'))
                await expect(leadsService.getAllLeads('flow-1')).rejects.toThrow('Error: leadsService.getAllLeads')
            })
        })

        describe('createLead', () => {
            it('should create a new lead with provided chatId', async () => {
                const leadData = { chatflowid: 'flow-1', chatId: 'custom-chat-id', name: 'John Doe', email: 'john@example.com' }
                const savedLead = { id: 'lead-1', ...leadData }
                mockRepository.create.mockReturnValue(savedLead)
                mockRepository.save.mockResolvedValue(savedLead)

                const result = await leadsService.createLead(leadData)

                expect(result).toEqual(savedLead)
                expect(mockRepository.save).toHaveBeenCalled()
            })

            it('should generate chatId when not provided', async () => {
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation(async (entity: any) => entity)

                const result = await leadsService.createLead({ chatflowid: 'flow-1', name: 'Jane Doe' })
                expect(result.chatId).toBeTruthy()
            })

            it('should throw InternalChronosError on save error', async () => {
                mockRepository.create.mockReturnValue({})
                mockRepository.save.mockRejectedValue(new Error('Save failed'))
                await expect(leadsService.createLead({ chatflowid: 'flow-1' })).rejects.toThrow('Error: leadsService.createLead')
            })
        })
    })
}
