const buildAgentflowExports = require('../../src/utils/buildAgentflow')

export function predictionsServiceTest() {
    describe('Predictions Service', () => {
        const origUtilBuildAgentflow = buildAgentflowExports.utilBuildAgentflow

        beforeEach(() => {
            buildAgentflowExports.utilBuildAgentflow = jest.fn()
        })

        afterEach(() => {
            buildAgentflowExports.utilBuildAgentflow = origUtilBuildAgentflow
        })

        const service = require('../../src/services/predictions').default

        describe('buildAgentflow', () => {
            it('should call utilBuildAgentflow and return result', async () => {
                const mockResult = { text: 'Hello!' }
                buildAgentflowExports.utilBuildAgentflow.mockResolvedValue(mockResult)

                const req = { body: { question: 'hi' } } as any
                const result = await service.buildAgentflow(req)

                expect(result).toEqual(mockResult)
                expect(buildAgentflowExports.utilBuildAgentflow).toHaveBeenCalledWith(req)
            })

            it('should throw InternalChronosError when utilBuildAgentflow fails', async () => {
                buildAgentflowExports.utilBuildAgentflow.mockRejectedValue(new Error('Build failed'))

                const req = { body: {} } as any
                await expect(service.buildAgentflow(req)).rejects.toThrow('Error: predictionsServices.buildAgentflow')
            })
        })
    })
}
