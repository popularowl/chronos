const hubExports = require('../../src/utils/hub')

export function loadPromptsServiceTest() {
    describe('Load Prompts Service', () => {
        const origParsePrompt = hubExports.parsePrompt

        beforeEach(() => {
            hubExports.parsePrompt = jest.fn()
        })

        afterEach(() => {
            hubExports.parsePrompt = origParsePrompt
        })

        const service = require('../../src/services/load-prompts').default

        describe('createPrompt', () => {
            it('should throw error when langchain hub pull fails', async () => {
                await expect(service.createPrompt('nonexistent-prompt')).rejects.toThrow(
                    'Error: loadPromptsService.createPrompt'
                )
            })
        })
    })
}
