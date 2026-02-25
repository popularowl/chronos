const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function componentsCredentialsServiceTest() {
    describe('Components Credentials Service', () => {
        const mockNodesPool: { componentCredentials: Record<string, any> } = {
            componentCredentials: {
                'openai-cred': { name: 'OpenAI', icon: '/icons/openai.svg' },
                'pinecone-cred': { name: 'Pinecone', icon: '/icons/pinecone.png' }
            }
        }
        const mockAppServer = { nodesPool: mockNodesPool }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const service = require('../../src/services/components-credentials').default

        describe('getAllComponentsCredentials', () => {
            it('should return all component credentials', async () => {
                const result = await service.getAllComponentsCredentials()
                expect(result).toHaveLength(2)
            })
        })

        describe('getComponentByName', () => {
            it('should return credential by name', async () => {
                const result = await service.getComponentByName('openai-cred')
                expect(result).toHaveProperty('name', 'OpenAI')
            })

            it('should throw when credential not found', async () => {
                await expect(service.getComponentByName('nonexistent')).rejects.toThrow('Credential nonexistent not found')
            })

            it('should handle multiple credentials with &amp;', async () => {
                const result = await service.getComponentByName('openai-cred&amp;pinecone-cred')
                expect(result).toHaveLength(2)
            })

            it('should throw when one of multiple credentials not found', async () => {
                await expect(service.getComponentByName('openai-cred&amp;nonexistent')).rejects.toThrow(
                    'Credential nonexistent not found'
                )
            })
        })

        describe('getSingleComponentsCredentialIcon', () => {
            it('should return icon path for svg', async () => {
                const result = await service.getSingleComponentsCredentialIcon('openai-cred')
                expect(result).toBe('/icons/openai.svg')
            })

            it('should return icon path for png', async () => {
                const result = await service.getSingleComponentsCredentialIcon('pinecone-cred')
                expect(result).toBe('/icons/pinecone.png')
            })

            it('should throw when credential not found', async () => {
                await expect(service.getSingleComponentsCredentialIcon('nonexistent')).rejects.toThrow()
            })

            it('should throw when icon is undefined', async () => {
                mockNodesPool.componentCredentials['no-icon-cred'] = { name: 'NoIcon' } as any
                await expect(service.getSingleComponentsCredentialIcon('no-icon-cred')).rejects.toThrow('icon not found')
                delete (mockNodesPool.componentCredentials as any)['no-icon-cred']
            })

            it('should throw when icon has invalid extension', async () => {
                mockNodesPool.componentCredentials['bad-icon-cred'] = { name: 'BadIcon', icon: 'not-a-valid-icon' } as any
                await expect(service.getSingleComponentsCredentialIcon('bad-icon-cred')).rejects.toThrow('missing icon')
                delete (mockNodesPool.componentCredentials as any)['bad-icon-cred']
            })
        })
    })
}
