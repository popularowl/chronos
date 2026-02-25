const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function textToSpeechServiceTest() {
    describe('Text To Speech Service', () => {
        const mockAppServer = {
            AppDataSource: {}
        }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const service = require('../../src/services/text-to-speech').default

        describe('getVoices', () => {
            it('should throw when credentialId is not provided', async () => {
                await expect(service.getVoices('openai', undefined)).rejects.toThrow('Credential ID required')
            })

            it('should throw when getVoices fails', async () => {
                await expect(service.getVoices('invalid-provider', 'cred-123')).rejects.toThrow(
                    'Error: textToSpeechService.getVoices'
                )
            })
        })
    })
}
