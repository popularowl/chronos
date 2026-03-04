const buildChatflowExports = require('../../src/utils/buildAgentflow')

export function predictionsServiceTest() {
    describe('Predictions Service', () => {
        const origUtilBuildChatflow = buildChatflowExports.utilBuildChatflow

        beforeEach(() => {
            buildChatflowExports.utilBuildChatflow = jest.fn()
        })

        afterEach(() => {
            buildChatflowExports.utilBuildChatflow = origUtilBuildChatflow
        })

        const service = require('../../src/services/predictions').default

        describe('buildChatflow', () => {
            it('should call utilBuildChatflow and return result', async () => {
                const mockResult = { text: 'Hello!' }
                buildChatflowExports.utilBuildChatflow.mockResolvedValue(mockResult)

                const req = { body: { question: 'hi' } } as any
                const result = await service.buildChatflow(req)

                expect(result).toEqual(mockResult)
                expect(buildChatflowExports.utilBuildChatflow).toHaveBeenCalledWith(req)
            })

            it('should throw InternalChronosError when utilBuildChatflow fails', async () => {
                buildChatflowExports.utilBuildChatflow.mockRejectedValue(new Error('Build failed'))

                const req = { body: {} } as any
                await expect(service.buildChatflow(req)).rejects.toThrow('Error: predictionsServices.buildChatflow')
            })
        })
    })
}
