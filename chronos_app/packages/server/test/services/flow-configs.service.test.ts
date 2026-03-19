const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')
const agentflowsServiceExports = require('../../src/services/agentflows')
const utilsExports = require('../../src/utils')

export function flowConfigsServiceTest() {
    describe('Flow Configs Service', () => {
        const mockNodesPool = {
            componentCredentials: {
                'openai-credential': { name: 'OpenAI API Key' }
            }
        }

        const mockAppServer = {
            AppDataSource: { getRepository: jest.fn() },
            nodesPool: mockNodesPool
        }

        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp
        const origGetAgentflowById = agentflowsServiceExports.default?.getAgentflowById
        const origFindAvailableConfigs = utilsExports.findAvailableConfigs

        let mockGetAgentflowById: jest.Mock
        let mockFindAvailableConfigs: jest.Mock

        beforeEach(() => {
            mockGetAgentflowById = jest.fn()
            mockFindAvailableConfigs = jest.fn()
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            if (agentflowsServiceExports.default) {
                agentflowsServiceExports.default.getAgentflowById = mockGetAgentflowById
            }
            utilsExports.findAvailableConfigs = mockFindAvailableConfigs
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
            if (agentflowsServiceExports.default) {
                agentflowsServiceExports.default.getAgentflowById = origGetAgentflowById
            }
            utilsExports.findAvailableConfigs = origFindAvailableConfigs
        })

        const flowConfigsService = require('../../src/services/flow-configs').default

        describe('getSingleFlowConfig', () => {
            it('should return available configs for an agentflow', async () => {
                const mockAgentflow = {
                    id: 'flow-1',
                    flowData: JSON.stringify({
                        nodes: [{ id: 'node-1', data: { name: 'OpenAI Chat' } }]
                    })
                }
                const mockConfigs = [{ nodeId: 'node-1', label: 'Model', name: 'model' }]
                mockGetAgentflowById.mockResolvedValue(mockAgentflow)
                mockFindAvailableConfigs.mockReturnValue(mockConfigs)

                const result = await flowConfigsService.getSingleFlowConfig('flow-1')

                expect(result).toEqual(mockConfigs)
                expect(mockGetAgentflowById).toHaveBeenCalledWith('flow-1')
                expect(mockFindAvailableConfigs).toHaveBeenCalledWith(expect.any(Array), mockNodesPool.componentCredentials)
            })

            it('should throw error when agentflow not found', async () => {
                mockGetAgentflowById.mockResolvedValue(null)
                await expect(flowConfigsService.getSingleFlowConfig('non-existent')).rejects.toThrow('Agentflow non-existent not found')
            })

            it('should throw InternalChronosError on general error', async () => {
                mockGetAgentflowById.mockRejectedValue(new Error('Database error'))
                await expect(flowConfigsService.getSingleFlowConfig('flow-1')).rejects.toThrow(
                    'Error: flowConfigService.getSingleFlowConfig'
                )
            })

            it('should parse flowData JSON correctly', async () => {
                const nodes = [
                    { id: 'node-1', data: { name: 'LLM' } },
                    { id: 'node-2', data: { name: 'Memory' } }
                ]
                const mockAgentflow = { id: 'flow-1', flowData: JSON.stringify({ nodes }) }
                mockGetAgentflowById.mockResolvedValue(mockAgentflow)
                mockFindAvailableConfigs.mockReturnValue([])

                await flowConfigsService.getSingleFlowConfig('flow-1')

                expect(mockFindAvailableConfigs).toHaveBeenCalledWith(nodes, mockNodesPool.componentCredentials)
            })
        })
    })
}
