import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'
import { getUserSearchOptions } from '../../src/utils/openSourceStubs'

const adminContext = { userId: 'admin-1', role: 'admin' }
const userContext = { userId: 'user-1', role: 'user' }
const otherUserContext = { userId: 'user-2', role: 'user' }

/**
 * Test suite for user-scoping ownership checks across services.
 * Uses mocked database to verify that non-admin users are filtered/blocked
 * and admins can access everything.
 */
export function userScopingServiceTest() {
    describe('User Scoping - getUserSearchOptions helper', () => {
        it('should return empty object for admin', () => {
            const result = getUserSearchOptions(adminContext)
            expect(result).toEqual({})
        })

        it('should return userId filter for non-admin', () => {
            const result = getUserSearchOptions(userContext)
            expect(result).toEqual({ userId: 'user-1' })
        })
    })

    describe('User Scoping - Credentials Service', () => {
        let credentialsService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockAppServer: any

        beforeAll(() => {
            jest.resetModules()

            mockRepository = createMockRepository()
            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                nodesPool: { componentCredentials: {} }
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                transformToCredentialEntity: jest.fn((body: any) => Promise.resolve(body)),
                decryptCredentialData: jest.fn().mockResolvedValue({ apiKey: 'decrypted-key' })
            }))

            credentialsService = require('../../src/services/credentials').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
        })

        it('createCredential should set userId from userContext', async () => {
            const credentialData = { name: 'Test', credentialName: 'openAIApi', plainDataObj: { apiKey: 'k' } }
            const saved = { id: 'cred-1', ...credentialData, userId: 'user-1' }

            mockRepository.create.mockReturnValue(saved)
            mockRepository.save.mockResolvedValue(saved)

            const result = await credentialsService.createCredential(credentialData, userContext)

            expect(result.userId).toEqual('user-1')
        })

        it('getAllCredentials should filter by userId for non-admin', async () => {
            mockRepository.find.mockResolvedValue([])

            await credentialsService.getAllCredentials(undefined, userContext)

            expect(mockRepository.find).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
        })

        it('getAllCredentials should return all for admin', async () => {
            mockRepository.find.mockResolvedValue([])

            await credentialsService.getAllCredentials(undefined, adminContext)

            expect(mockRepository.find).toHaveBeenCalledWith({ where: {} })
        })

        it('getCredentialById should throw 403 for non-owner', async () => {
            mockRepository.findOneBy.mockResolvedValue({ id: 'cred-1', userId: 'user-1', encryptedData: 'enc' })

            await expect(credentialsService.getCredentialById('cred-1', otherUserContext)).rejects.toThrow(
                'You do not have permission to access this credential'
            )
        })

        it('deleteCredentials should throw 403 for non-owner', async () => {
            mockRepository.findOneBy.mockResolvedValue({ id: 'cred-1', userId: 'user-1' })

            await expect(credentialsService.deleteCredentials('cred-1', otherUserContext)).rejects.toThrow(
                'You do not have permission to delete this credential'
            )
        })

        it('updateCredential should throw 403 for non-owner', async () => {
            mockRepository.findOneBy.mockResolvedValue({ id: 'cred-1', userId: 'user-1', encryptedData: 'enc' })

            await expect(credentialsService.updateCredential('cred-1', { name: 'New' }, otherUserContext)).rejects.toThrow(
                'You do not have permission to update this credential'
            )
        })
    })

    describe('User Scoping - AgentFlows Service', () => {
        let agentflowsService: any
        let mockRepository: ReturnType<typeof createMockRepository>
        let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>
        let mockAppServer: any

        beforeAll(() => {
            jest.resetModules()

            mockRepository = createMockRepository()
            mockQueryBuilder = createMockQueryBuilder()
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

            mockAppServer = {
                AppDataSource: {
                    getRepository: jest.fn().mockReturnValue(mockRepository)
                },
                telemetry: { sendTelemetry: jest.fn().mockResolvedValue(undefined) },
                metricsProvider: { incrementCounter: jest.fn() }
            }

            jest.doMock('../../src/utils/getRunningExpressApp', () => ({
                getRunningExpressApp: jest.fn(() => mockAppServer)
            }))

            jest.doMock('../../src/utils', () => ({
                getAppVersion: jest.fn().mockResolvedValue('1.0.0'),
                getTelemetryFlowObj: jest.fn().mockReturnValue({})
            }))

            jest.doMock('../../src/utils/fileRepository', () => ({
                containsBase64File: jest.fn().mockReturnValue(false),
                updateFlowDataWithFilePaths: jest.fn()
            }))

            jest.doMock('../../src/services/documentstore', () => ({
                default: {
                    updateDocumentStoreUsage: jest.fn().mockResolvedValue(undefined)
                }
            }))

            jest.doMock('../../src/utils/getUploadsConfig', () => ({
                utilGetUploadsConfig: jest.fn()
            }))

            jest.doMock('../../src/utils/logger', () => ({
                default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() }
            }))

            agentflowsService = require('../../src/services/agentflows').default
        })

        afterAll(() => {
            jest.resetModules()
        })

        beforeEach(() => {
            jest.clearAllMocks()
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])
        })

        it('getAllAgentflows should filter by userId for non-admin', async () => {
            await agentflowsService.getAllAgentflows(undefined, -1, -1, userContext)

            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('chat_flow.userId = :userId', { userId: 'user-1' })
        })

        it('getAllAgentflows should not filter by userId for admin', async () => {
            await agentflowsService.getAllAgentflows(undefined, -1, -1, adminContext)

            expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
                'chat_flow.userId = :userId',
                expect.objectContaining({ userId: expect.anything() })
            )
        })

        it('getAgentflowById should throw 403 for non-owner', async () => {
            mockRepository.findOne.mockResolvedValue({ id: 'cf-1', userId: 'user-1' })

            await expect(agentflowsService.getAgentflowById('cf-1', otherUserContext)).rejects.toThrow(
                'You do not have permission to access this agentflow'
            )
        })

        it('saveAgentflow should set userId from userContext', async () => {
            const newAgentFlow = {
                name: 'Test',
                type: 'AGENTFLOW',
                flowData: JSON.stringify({ nodes: [], edges: [] })
            }
            const saved = { id: 'cf-1', ...newAgentFlow, userId: 'user-1' }

            mockRepository.create.mockReturnValue(saved)
            mockRepository.save.mockResolvedValue(saved)

            const result = await agentflowsService.saveAgentflow(newAgentFlow, userContext)

            expect(result.userId).toEqual('user-1')
        })

        it('updateAgentflow should throw 403 for non-owner', async () => {
            const existingAgentflow = { id: 'cf-1', userId: 'user-1', type: 'AGENTFLOW' }
            const updateData = { name: 'Updated' }

            await expect(agentflowsService.updateAgentflow(existingAgentflow, updateData, otherUserContext)).rejects.toThrow(
                'You do not have permission to update this agentflow'
            )
        })

        it('deleteAgentflow should throw 403 for non-owner', async () => {
            mockRepository.findOne.mockResolvedValue({ id: 'cf-1', userId: 'user-1' })

            await expect(agentflowsService.deleteAgentflow('cf-1', otherUserContext)).rejects.toThrow(
                'You do not have permission to delete this agentflow'
            )
        })
    })
}
