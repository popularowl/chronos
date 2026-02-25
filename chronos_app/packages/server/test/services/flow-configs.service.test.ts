const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')
const chatflowsServiceExports = require('../../src/services/chatflows')
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
        const origGetChatflowById = chatflowsServiceExports.default?.getChatflowById
        const origFindAvailableConfigs = utilsExports.findAvailableConfigs

        let mockGetChatflowById: jest.Mock
        let mockFindAvailableConfigs: jest.Mock

        beforeEach(() => {
            mockGetChatflowById = jest.fn()
            mockFindAvailableConfigs = jest.fn()
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            if (chatflowsServiceExports.default) {
                chatflowsServiceExports.default.getChatflowById = mockGetChatflowById
            }
            utilsExports.findAvailableConfigs = mockFindAvailableConfigs
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
            if (chatflowsServiceExports.default) {
                chatflowsServiceExports.default.getChatflowById = origGetChatflowById
            }
            utilsExports.findAvailableConfigs = origFindAvailableConfigs
        })

        const flowConfigsService = require('../../src/services/flow-configs').default

        describe('getSingleFlowConfig', () => {
            it('should return available configs for a chatflow', async () => {
                const mockChatflow = {
                    id: 'flow-1',
                    flowData: JSON.stringify({
                        nodes: [{ id: 'node-1', data: { name: 'OpenAI Chat' } }]
                    })
                }
                const mockConfigs = [{ nodeId: 'node-1', label: 'Model', name: 'model' }]
                mockGetChatflowById.mockResolvedValue(mockChatflow)
                mockFindAvailableConfigs.mockReturnValue(mockConfigs)

                const result = await flowConfigsService.getSingleFlowConfig('flow-1')

                expect(result).toEqual(mockConfigs)
                expect(mockGetChatflowById).toHaveBeenCalledWith('flow-1')
                expect(mockFindAvailableConfigs).toHaveBeenCalledWith(expect.any(Array), mockNodesPool.componentCredentials)
            })

            it('should throw error when chatflow not found', async () => {
                mockGetChatflowById.mockResolvedValue(null)
                await expect(flowConfigsService.getSingleFlowConfig('non-existent')).rejects.toThrow('Chatflow non-existent not found')
            })

            it('should throw InternalChronosError on general error', async () => {
                mockGetChatflowById.mockRejectedValue(new Error('Database error'))
                await expect(flowConfigsService.getSingleFlowConfig('flow-1')).rejects.toThrow(
                    'Error: flowConfigService.getSingleFlowConfig'
                )
            })

            it('should parse flowData JSON correctly', async () => {
                const nodes = [
                    { id: 'node-1', data: { name: 'LLM' } },
                    { id: 'node-2', data: { name: 'Memory' } }
                ]
                const mockChatflow = { id: 'flow-1', flowData: JSON.stringify({ nodes }) }
                mockGetChatflowById.mockResolvedValue(mockChatflow)
                mockFindAvailableConfigs.mockReturnValue([])

                await flowConfigsService.getSingleFlowConfig('flow-1')

                expect(mockFindAvailableConfigs).toHaveBeenCalledWith(nodes, mockNodesPool.componentCredentials)
            })
        })
    })
}
