import { createMockRepository } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function getUploadsConfigUtilTest() {
    describe('getUploadsConfig util', () => {
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
            mockRepository.findOneBy.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { utilGetUploadsConfig } = require('../../src/utils/getUploadsConfig')

        it('should throw error when chatflow not found', async () => {
            mockRepository.findOneBy.mockResolvedValue(null)
            await expect(utilGetUploadsConfig('non-existent')).rejects.toThrow('Chatflow non-existent not found')
        })

        it('should return default config for simple chatflow with no uploads', async () => {
            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes: [], edges: [] }),
                speechToText: null
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result).toEqual({
                isSpeechToTextEnabled: false,
                isImageUploadAllowed: false,
                isRAGFileUploadAllowed: false,
                imgUploadSizeAndTypes: [],
                fileUploadSizeAndTypes: []
            })
        })

        it('should detect speech-to-text when enabled', async () => {
            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes: [], edges: [] }),
                speechToText: JSON.stringify({ whisper: { status: true } })
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result.isSpeechToTextEnabled).toBe(true)
        })

        it('should not enable STT when provider is none', async () => {
            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes: [], edges: [] }),
                speechToText: JSON.stringify({ none: { status: true } })
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result.isSpeechToTextEnabled).toBe(false)
        })

        it('should detect RAG file upload when vector store has file upload enabled', async () => {
            const nodes = [
                {
                    id: 'vs-1',
                    data: {
                        category: 'Vector Stores',
                        inputs: { fileUpload: true },
                        inputParams: []
                    }
                },
                {
                    id: 'dl-1',
                    data: {
                        category: 'Document Loaders',
                        inputParams: [{ type: 'file', fileType: '.pdf, .txt' }]
                    }
                }
            ]
            const edges = [
                {
                    source: 'dl-1',
                    target: 'vs-1',
                    targetHandle: 'vs-1-input-document-Document'
                }
            ]

            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes, edges }),
                speechToText: null
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result.isRAGFileUploadAllowed).toBe(true)
            expect(result.fileUploadSizeAndTypes).toHaveLength(1)
        })

        it('should detect image upload for agentflow nodes', async () => {
            const nodes = [
                {
                    id: 'af-1',
                    data: {
                        name: 'agentNode',
                        category: 'Agent Flows',
                        inputs: { agentModelConfig: { allowImageUploads: true } },
                        inputParams: []
                    }
                }
            ]

            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes, edges: [] }),
                speechToText: null
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result.isImageUploadAllowed).toBe(true)
            expect(result.imgUploadSizeAndTypes).toHaveLength(1)
        })

        it('should detect image upload for allowed chain nodes with chat models', async () => {
            const nodes = [
                {
                    id: 'chain-1',
                    data: {
                        name: 'llmChain',
                        category: 'Chains',
                        inputs: {},
                        inputParams: []
                    }
                },
                {
                    id: 'cm-1',
                    data: {
                        name: 'chatModel',
                        category: 'Chat Models',
                        inputs: { allowImageUploads: true },
                        inputParams: [{ name: 'allowImageUploads', type: 'boolean' }]
                    }
                }
            ]

            mockRepository.findOneBy.mockResolvedValue({
                id: 'flow-1',
                flowData: JSON.stringify({ nodes, edges: [] }),
                speechToText: null
            })

            const result = await utilGetUploadsConfig('flow-1')

            expect(result.isImageUploadAllowed).toBe(true)
        })
    })
}
