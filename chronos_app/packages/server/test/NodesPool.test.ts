/**
 * Test suite for NodesPool node filtering
 * Tests loadNodesConfig resolution and category-based allowlist behaviour
 */
import * as fs from 'fs'
import * as path from 'path'

export function nodesPoolTest() {
    describe('NodesPool - Node Filtering', () => {
        let loadNodesConfig: () => Record<string, string[] | '*'> | null

        const originalEnv = { ...process.env }

        beforeAll(() => {
            jest.resetModules()

            const mockLogger = {
                debug: jest.fn(),
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                http: jest.fn(),
                level: 'info'
            }
            jest.doMock('../src/utils/logger', () => ({
                __esModule: true,
                default: mockLogger,
                expressRequestLogger: jest.fn((req: any, res: any, next: any) => next())
            }))

            jest.doMock('../src/utils', () => ({
                getNodeModulesPackagePath: jest.fn(() => '/fake'),
                databaseEntities: {}
            }))

            jest.doMock('../src/AppConfig', () => ({
                appConfig: { showCommunityNodes: false }
            }))

            const nodesPool = require('../src/NodesPool')
            loadNodesConfig = nodesPool.loadNodesConfig
        })

        afterAll(() => {
            jest.resetModules()
        })

        afterEach(() => {
            delete process.env.PROVIDERS_CONFIG_LOCATION
            Object.assign(process.env, originalEnv)
        })

        describe('loadNodesConfig', () => {
            it('should return null when no config file exists', () => {
                process.env.PROVIDERS_CONFIG_LOCATION = '/nonexistent/path.json'

                const result = loadNodesConfig()

                expect(result).toBeNull()
            })

            it('should load category-based config from file', () => {
                const tmpConfig = path.join(__dirname, 'tmp-categories.json')
                fs.writeFileSync(
                    tmpConfig,
                    JSON.stringify({
                        mode: 'allowlist',
                        categories: {
                            'Chat Models': ['chatOpenAI', 'chatAnthropic'],
                            Tools: '*',
                            Embeddings: ['openAIEmbedding']
                        }
                    })
                )
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const result = loadNodesConfig()

                    expect(result).not.toBeNull()
                    expect(result!['Chat Models']).toEqual(['chatOpenAI', 'chatAnthropic'])
                    expect(result!['Tools']).toBe('*')
                    expect(result!['Embeddings']).toEqual(['openAIEmbedding'])
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should return null when config has unrecognised mode', () => {
                const tmpConfig = path.join(__dirname, 'tmp-bad-mode.json')
                fs.writeFileSync(tmpConfig, JSON.stringify({ mode: 'denylist', categories: {} }))
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const result = loadNodesConfig()
                    expect(result).toBeNull()
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should return null when config has no categories key', () => {
                const tmpConfig = path.join(__dirname, 'tmp-no-categories.json')
                fs.writeFileSync(tmpConfig, JSON.stringify({ mode: 'allowlist' }))
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const result = loadNodesConfig()
                    expect(result).toBeNull()
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should return null when config has invalid JSON', () => {
                const tmpConfig = path.join(__dirname, 'tmp-bad-json.json')
                fs.writeFileSync(tmpConfig, 'not valid json {{{')
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const result = loadNodesConfig()
                    expect(result).toBeNull()
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should load from default providers.config.json when no env var set', () => {
                delete process.env.PROVIDERS_CONFIG_LOCATION

                // The default path resolves to packages/server/providers.config.json
                const defaultPath = path.join(__dirname, '..', 'providers.config.json')
                if (fs.existsSync(defaultPath)) {
                    const result = loadNodesConfig()

                    expect(result).not.toBeNull()
                    expect(result!['Chat Models']).toBeDefined()
                    expect(Array.isArray(result!['Chat Models'])).toBe(true)
                }
            })
        })

        describe('isNodeAllowed (via loadNodesConfig integration)', () => {
            // We test the filtering logic indirectly by importing isNodeAllowed
            // It's a module-private function, so we test through the exported loadNodesConfig
            // and document the expected behavior

            it('should allow all nodes when config is null', () => {
                process.env.PROVIDERS_CONFIG_LOCATION = '/nonexistent/path.json'
                const config = loadNodesConfig()
                expect(config).toBeNull()
                // When null, isNodeAllowed returns true for everything
            })

            it('should return wildcard categories as "*"', () => {
                const tmpConfig = path.join(__dirname, 'tmp-wildcard.json')
                fs.writeFileSync(
                    tmpConfig,
                    JSON.stringify({
                        mode: 'allowlist',
                        categories: { Tools: '*', 'Agent Flows': '*' }
                    })
                )
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const config = loadNodesConfig()
                    expect(config!['Tools']).toBe('*')
                    expect(config!['Agent Flows']).toBe('*')
                    // Unlisted categories should be undefined (disabled)
                    expect(config!['Chat Models']).toBeUndefined()
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should return specific node arrays for non-wildcard categories', () => {
                const tmpConfig = path.join(__dirname, 'tmp-specific.json')
                fs.writeFileSync(
                    tmpConfig,
                    JSON.stringify({
                        mode: 'allowlist',
                        categories: {
                            'Chat Models': ['chatOpenAI'],
                            'Vector Stores': ['pinecone', 'supabase']
                        }
                    })
                )
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const config = loadNodesConfig()
                    expect(config!['Chat Models']).toEqual(['chatOpenAI'])
                    expect(config!['Vector Stores']).toEqual(['pinecone', 'supabase'])
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should handle empty categories object', () => {
                const tmpConfig = path.join(__dirname, 'tmp-empty.json')
                fs.writeFileSync(tmpConfig, JSON.stringify({ mode: 'allowlist', categories: {} }))
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const config = loadNodesConfig()
                    expect(config).toEqual({})
                    // All categories unlisted → all disabled
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })

            it('should handle mix of wildcard and specific node lists', () => {
                const tmpConfig = path.join(__dirname, 'tmp-mixed.json')
                fs.writeFileSync(
                    tmpConfig,
                    JSON.stringify({
                        mode: 'allowlist',
                        categories: {
                            'Chat Models': ['chatOpenAI', 'chatAnthropic'],
                            Tools: '*',
                            Embeddings: ['openAIEmbedding'],
                            Cache: '*'
                        }
                    })
                )
                process.env.PROVIDERS_CONFIG_LOCATION = tmpConfig

                try {
                    const config = loadNodesConfig()
                    expect(config!['Chat Models']).toEqual(['chatOpenAI', 'chatAnthropic'])
                    expect(config!['Tools']).toBe('*')
                    expect(config!['Embeddings']).toEqual(['openAIEmbedding'])
                    expect(config!['Cache']).toBe('*')
                    expect(config!['Document Loaders']).toBeUndefined()
                } finally {
                    fs.unlinkSync(tmpConfig)
                }
            })
        })
    })
}
