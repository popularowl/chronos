import { createMockRepository, createMockQueryBuilder } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')
const addChatflowsCountExports = require('../../src/utils/addChatflowsCount')

export function apikeyServiceTest() {
    describe('API Key Service', () => {
        const mockRepository = createMockRepository()
        const mockQueryBuilder = createMockQueryBuilder()
        mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)

        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            }
        }

        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp
        const origAddChatflowsCount = addChatflowsCountExports.addChatflowsCount

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            addChatflowsCountExports.addChatflowsCount = jest.fn(async (keys: any[]) => keys.map((k: any) => ({ ...k, chatflowsCount: 0 })))
            mockAppServer.AppDataSource.getRepository.mockReturnValue(mockRepository)
            mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
            // Reset query builder mocks
            mockQueryBuilder.getManyAndCount.mockReset()
            mockQueryBuilder.skip.mockClear()
            mockQueryBuilder.take.mockClear()
            mockRepository.findOneBy.mockReset()
            mockRepository.create.mockReset()
            mockRepository.save.mockReset()
            mockRepository.delete.mockReset()
            mockRepository.find.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
            addChatflowsCountExports.addChatflowsCount = origAddChatflowsCount
        })

        const apikeyService = require('../../src/services/apikey').default

        describe('getAllApiKeys', () => {
            it('should return all API keys', async () => {
                const mockKeys = [
                    { id: '1', keyName: 'Key1', apiKey: 'abc123' },
                    { id: '2', keyName: 'Key2', apiKey: 'def456' }
                ]
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([mockKeys, 2])

                const result = await apikeyService.getAllApiKeys()

                expect(Array.isArray(result)).toBe(true)
                expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('api_key')
            })

            it('should return paginated results when page and limit provided', async () => {
                const mockKeys = [{ id: '1', keyName: 'Key1', apiKey: 'abc123' }]
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([mockKeys, 10])

                const result = await apikeyService.getAllApiKeys(false, 2, 5)

                expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5)
                expect(mockQueryBuilder.take).toHaveBeenCalledWith(5)
                expect(result).toHaveProperty('data')
                expect(result).toHaveProperty('total', 10)
            })

            it('should auto-create key when empty and autoCreateNewKey is true', async () => {
                mockQueryBuilder.getManyAndCount
                    .mockResolvedValueOnce([[], 0])
                    .mockResolvedValueOnce([[], 0])
                    .mockResolvedValueOnce([[{ id: 'new-id', keyName: 'DefaultKey' }], 1])
                mockRepository.create.mockReturnValue({})
                mockRepository.save.mockResolvedValue({})

                const result = await apikeyService.getAllApiKeys(true)

                expect(Array.isArray(result)).toBe(true)
            })
        })

        describe('getApiKey', () => {
            it('should return API key by apiKey string', async () => {
                const mockKey = { id: '1', apiKey: 'test-key-123' }
                mockRepository.findOneBy.mockResolvedValue(mockKey)

                const result = await apikeyService.getApiKey('test-key-123')

                expect(result).toEqual(mockKey)
                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ apiKey: 'test-key-123' })
            })
        })

        describe('getApiKeyById', () => {
            it('should return API key by ID', async () => {
                const mockKey = { id: 'key-id-1', keyName: 'MyKey' }
                mockRepository.findOneBy.mockResolvedValue(mockKey)

                const result = await apikeyService.getApiKeyById('key-id-1')

                expect(result).toEqual(mockKey)
                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'key-id-1' })
            })
        })

        describe('createApiKey', () => {
            it('should create a new API key', async () => {
                mockRepository.create.mockReturnValue({})
                mockRepository.save.mockResolvedValue({})
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([[{ id: 'new-key' }], 1])

                await apikeyService.createApiKey('TestKey')

                expect(mockRepository.create).toHaveBeenCalled()
                expect(mockRepository.save).toHaveBeenCalled()
            })

            it('should generate unique apiKey and apiSecret', async () => {
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockImplementation(async (entity: any) => entity)
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([[{ id: '1' }], 1])

                await apikeyService.createApiKey('UniqueKey')

                const createCall = mockRepository.create.mock.calls[0][0]
                expect(createCall).toHaveProperty('apiKey')
                expect(createCall).toHaveProperty('apiSecret')
                expect(createCall.apiKey).toBeTruthy()
                expect(createCall.apiSecret).toBeTruthy()
            })
        })

        describe('updateApiKey', () => {
            it('should update key name', async () => {
                const existingKey = { id: 'key-1', keyName: 'OldName' }
                mockRepository.findOneBy.mockResolvedValue(existingKey)
                mockRepository.save.mockResolvedValue({ ...existingKey, keyName: 'NewName' })
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([[{ id: 'key-1', keyName: 'NewName' }], 1])

                await apikeyService.updateApiKey('key-1', 'NewName')

                expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 'key-1' })
                expect(mockRepository.save).toHaveBeenCalled()
            })
        })

        describe('deleteApiKey', () => {
            it('should delete API key by ID', async () => {
                mockRepository.delete.mockResolvedValue({ affected: 1 })

                const result = await apikeyService.deleteApiKey('key-1')

                expect(result).toEqual({ affected: 1 })
                expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'key-1' })
            })

            it('should throw error when delete fails', async () => {
                mockRepository.delete.mockResolvedValue(null)
                await expect(apikeyService.deleteApiKey('key-1')).rejects.toThrow()
            })
        })

        describe('verifyApiKey', () => {
            it('should return OK for valid API key', async () => {
                mockRepository.findOneBy.mockResolvedValue({ id: '1', apiKey: 'valid-key' })
                const result = await apikeyService.verifyApiKey('valid-key')
                expect(result).toBe('OK')
            })
        })

        describe('importKeys', () => {
            const createBase64Body = (keys: any[], importMode: string = 'ignoreIfExist') => ({
                jsonFile: 'data:application/json;base64,' + Buffer.from(JSON.stringify(keys)).toString('base64'),
                importMode
            })

            it('should import valid keys with ignoreIfExist mode', async () => {
                const importKeys = [
                    { id: 'import-1', keyName: 'ImportedKey', apiKey: 'imp-key-1', apiSecret: 'imp-secret-1', createdAt: '2024-01-01' }
                ]
                mockRepository.find.mockResolvedValue([])
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockResolvedValue({})
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([[{ id: 'import-1' }], 1])

                await apikeyService.importKeys(createBase64Body(importKeys))

                expect(mockRepository.save).toHaveBeenCalled()
            })

            it('should handle replaceAll import mode', async () => {
                const importKeys = [
                    { id: 'import-1', keyName: 'ImportedKey', apiKey: 'imp-key-1', apiSecret: 'imp-secret-1', createdAt: '2024-01-01' }
                ]
                mockRepository.find.mockResolvedValue([])
                mockRepository.delete.mockResolvedValue({ affected: 0 })
                mockRepository.create.mockImplementation((entity: any) => entity)
                mockRepository.save.mockResolvedValue({})
                mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([[{ id: 'import-1' }], 1])

                await apikeyService.importKeys(createBase64Body(importKeys, 'replaceAll'))

                expect(mockRepository.delete).toHaveBeenCalled()
            })

            it('should throw error in errorIfExist mode when key exists', async () => {
                const importKeys = [
                    { id: 'import-1', keyName: 'ExistingKey', apiKey: 'imp-key-1', apiSecret: 'imp-secret-1', createdAt: '2024-01-01' }
                ]
                mockRepository.find.mockResolvedValue([{ keyName: 'ExistingKey' }])

                await expect(apikeyService.importKeys(createBase64Body(importKeys, 'errorIfExist'))).rejects.toThrow()
            })
        })
    })
}
