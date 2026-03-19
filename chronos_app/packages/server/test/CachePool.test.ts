import { CachePool } from '../src/CachePool'

/**
 * Test suite for CachePool class
 * Tests in-memory caching functionality (non-queue mode)
 */
export function cachePoolTest() {
    describe('CachePool', () => {
        let cachePool: CachePool

        beforeEach(() => {
            // Ensure we're in non-queue mode
            delete process.env.MODE
            cachePool = new CachePool()
        })

        describe('SSO Token Cache', () => {
            it('should add and retrieve SSO token from cache', async () => {
                const token = 'test-sso-token'
                const value = { userId: '123', email: 'test@example.com' }

                await cachePool.addSSOTokenCache(token, value)
                const result = await cachePool.getSSOTokenCache(token)

                expect(result).toEqual(value)
            })

            it('should return undefined for non-existent SSO token', async () => {
                const result = await cachePool.getSSOTokenCache('non-existent-token')
                expect(result).toBeUndefined()
            })

            it('should delete SSO token from cache', async () => {
                const token = 'test-token-to-delete'
                const value = { userId: '456' }

                await cachePool.addSSOTokenCache(token, value)
                await cachePool.deleteSSOTokenCache(token)
                const result = await cachePool.getSSOTokenCache(token)

                expect(result).toBeUndefined()
            })

            it('should handle deleting non-existent token gracefully', async () => {
                await expect(cachePool.deleteSSOTokenCache('non-existent')).resolves.not.toThrow()
            })

            it('should overwrite existing SSO token value', async () => {
                const token = 'overwrite-token'
                const value1 = { userId: '111' }
                const value2 = { userId: '222' }

                await cachePool.addSSOTokenCache(token, value1)
                await cachePool.addSSOTokenCache(token, value2)
                const result = await cachePool.getSSOTokenCache(token)

                expect(result).toEqual(value2)
            })
        })

        describe('LLM Cache', () => {
            it('should add and retrieve LLM cache', async () => {
                const agentflowId = 'agentflow-123'
                const cacheMap = new Map([
                    ['key1', 'value1'],
                    ['key2', 'value2']
                ])

                await cachePool.addLLMCache(agentflowId, cacheMap)
                const result = await cachePool.getLLMCache(agentflowId)

                expect(result).toEqual(cacheMap)
            })

            it('should return undefined for non-existent LLM cache', async () => {
                const result = await cachePool.getLLMCache('non-existent-agentflow')
                expect(result).toBeUndefined()
            })

            it('should handle empty Map', async () => {
                const agentflowId = 'empty-cache'
                const emptyMap = new Map()

                await cachePool.addLLMCache(agentflowId, emptyMap)
                const result = await cachePool.getLLMCache(agentflowId)

                expect(result).toEqual(emptyMap)
                expect(result?.size).toBe(0)
            })

            it('should overwrite existing LLM cache', async () => {
                const agentflowId = 'overwrite-llm'
                const map1 = new Map([['a', '1']])
                const map2 = new Map([['b', '2']])

                await cachePool.addLLMCache(agentflowId, map1)
                await cachePool.addLLMCache(agentflowId, map2)
                const result = await cachePool.getLLMCache(agentflowId)

                expect(result).toEqual(map2)
            })
        })

        describe('Embedding Cache', () => {
            it('should add and retrieve embedding cache', async () => {
                const agentflowId = 'embedding-flow-123'
                const cacheMap = new Map([
                    ['embed1', [0.1, 0.2, 0.3]],
                    ['embed2', [0.4, 0.5, 0.6]]
                ])

                await cachePool.addEmbeddingCache(agentflowId, cacheMap)
                const result = await cachePool.getEmbeddingCache(agentflowId)

                expect(result).toEqual(cacheMap)
            })

            it('should return undefined for non-existent embedding cache', async () => {
                const result = await cachePool.getEmbeddingCache('non-existent')
                expect(result).toBeUndefined()
            })

            it('should handle complex embedding data', async () => {
                const agentflowId = 'complex-embed'
                const complexMap = new Map<any, any>([
                    ['text1', { embedding: [0.1, 0.2], metadata: { source: 'test' } }],
                    ['text2', { embedding: [0.3, 0.4], metadata: { source: 'test2' } }]
                ])

                await cachePool.addEmbeddingCache(agentflowId, complexMap)
                const result = await cachePool.getEmbeddingCache(agentflowId)

                expect(result).toEqual(complexMap)
            })
        })

        describe('MCP Cache', () => {
            it('should add and retrieve MCP cache in non-queue mode', async () => {
                const cacheKey = 'mcp-key-123'
                const value = { toolkit: 'test-toolkit', config: {} }

                await cachePool.addMCPCache(cacheKey, value)
                const result = await cachePool.getMCPCache(cacheKey)

                expect(result).toEqual(value)
            })

            it('should return undefined for non-existent MCP cache', async () => {
                const result = await cachePool.getMCPCache('non-existent-mcp')
                expect(result).toBeUndefined()
            })

            it('should handle MCP cache with function values', async () => {
                const cacheKey = 'mcp-with-func'
                const mockToolkit = {
                    name: 'test',
                    execute: () => 'result'
                }

                await cachePool.addMCPCache(cacheKey, mockToolkit)
                const result = await cachePool.getMCPCache(cacheKey)

                expect(result.name).toBe('test')
                expect(typeof result.execute).toBe('function')
            })
        })

        describe('Queue Mode Behavior', () => {
            it('should not store MCP cache when MODE is queue (MCP cache is memory-only)', async () => {
                // In queue mode, MCP cache is not used because it's memory-only
                // We just test the logic without creating actual Redis connection
                const originalMode = process.env.MODE
                process.env.MODE = 'queue'

                // MCP cache should return undefined in queue mode
                const result = await cachePool.getMCPCache('any-key')
                expect(result).toBeUndefined()

                // Restore
                if (originalMode) {
                    process.env.MODE = originalMode
                } else {
                    delete process.env.MODE
                }
            })
        })

        describe('close', () => {
            it('should close gracefully when no redis client', async () => {
                await expect(cachePool.close()).resolves.not.toThrow()
            })
        })

        describe('Multiple Cache Types', () => {
            it('should maintain separate caches for different types', async () => {
                const id = 'shared-id'
                const ssoValue = { type: 'sso' }
                const llmValue = new Map([['type', 'llm']])
                const embedValue = new Map([['type', 'embed']])

                await cachePool.addSSOTokenCache(id, ssoValue)
                await cachePool.addLLMCache(id, llmValue)
                await cachePool.addEmbeddingCache(id, embedValue)

                const ssoResult = await cachePool.getSSOTokenCache(id)
                const llmResult = await cachePool.getLLMCache(id)
                const embedResult = await cachePool.getEmbeddingCache(id)

                expect(ssoResult).toEqual(ssoValue)
                expect(llmResult).toEqual(llmValue)
                expect(embedResult).toEqual(embedValue)
            })
        })
    })
}
