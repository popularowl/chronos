const apikeyServiceExports = require('../../src/services/apikey')
const apiKeyUtilsExports = require('../../src/utils/apiKey')

export function validateKeyExtraUtilTest() {
    describe('validateKey util (extra)', () => {
        const origGetApiKeyById = apikeyServiceExports.default.getApiKeyById
        const origGetApiKey = apikeyServiceExports.default.getApiKey
        const origCompareKeys = apiKeyUtilsExports.compareKeys

        beforeEach(() => {
            apikeyServiceExports.default.getApiKeyById = jest.fn()
            apikeyServiceExports.default.getApiKey = jest.fn()
            apiKeyUtilsExports.compareKeys = jest.fn()
        })

        afterEach(() => {
            apikeyServiceExports.default.getApiKeyById = origGetApiKeyById
            apikeyServiceExports.default.getApiKey = origGetApiKey
            apiKeyUtilsExports.compareKeys = origCompareKeys
        })

        const { validateFlowAPIKey, validateAPIKey } = require('../../src/utils/validateKey')

        describe('validateFlowAPIKey', () => {
            it('should return false when apiKey not found', async () => {
                apikeyServiceExports.default.getApiKeyById.mockResolvedValue(null)
                const req = { headers: { authorization: 'Bearer test-key' } } as any
                const chatflow = { apikeyid: 'key-123' } as any

                const result = await validateFlowAPIKey(req, chatflow)

                expect(result).toBe(false)
            })

            it('should return false when compareKeys fails', async () => {
                apikeyServiceExports.default.getApiKeyById.mockResolvedValue({ apiSecret: 'stored-secret' })
                apiKeyUtilsExports.compareKeys.mockReturnValue(false)
                const req = { headers: { authorization: 'Bearer wrong-key' } } as any
                const chatflow = { apikeyid: 'key-123' } as any

                const result = await validateFlowAPIKey(req, chatflow)

                expect(result).toBe(false)
            })

            it('should return false when getApiKeyById throws', async () => {
                apikeyServiceExports.default.getApiKeyById.mockRejectedValue(new Error('DB error'))
                const req = { headers: { authorization: 'Bearer test-key' } } as any
                const chatflow = { apikeyid: 'key-123' } as any

                const result = await validateFlowAPIKey(req, chatflow)

                expect(result).toBe(false)
            })
        })

        describe('validateAPIKey', () => {
            it('should return valid with apiKey when compareKeys matches', async () => {
                const mockApiKey = { id: 'key-1', apiKey: 'test-key', apiSecret: 'stored-secret' }
                apikeyServiceExports.default.getApiKey.mockResolvedValue(mockApiKey)
                apiKeyUtilsExports.compareKeys.mockReturnValue(true)
                const req = { headers: { authorization: 'Bearer test-key' } } as any

                const result = await validateAPIKey(req)

                expect(result).toEqual({ isValid: true, apiKey: mockApiKey })
            })

            it('should return invalid with apiKey when compareKeys fails', async () => {
                const mockApiKey = { id: 'key-1', apiKey: 'test-key', apiSecret: 'stored-secret' }
                apikeyServiceExports.default.getApiKey.mockResolvedValue(mockApiKey)
                apiKeyUtilsExports.compareKeys.mockReturnValue(false)
                const req = { headers: { authorization: 'Bearer wrong-key' } } as any

                const result = await validateAPIKey(req)

                expect(result).toEqual({ isValid: false, apiKey: mockApiKey })
            })

            it('should return invalid when getApiKey throws', async () => {
                apikeyServiceExports.default.getApiKey.mockRejectedValue(new Error('DB error'))
                const req = { headers: { authorization: 'Bearer test-key' } } as any

                const result = await validateAPIKey(req)

                expect(result).toEqual({ isValid: false })
            })
        })
    })
}
