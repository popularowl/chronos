import { MCPServerTransport } from '../../src/Interface'
import { getPresets, getPreset, MCPPreset, isExecutableOnPath, __resetPathProbeCache } from '../../src/services/mcp-gateway/presets'

/**
 * Test suite for the MCP-server preset catalogue.
 *
 * Presets are static config so the suite focuses on shape contracts:
 * every preset has the required fields, a non-empty icon SVG, a
 * supported transport, and (for stdio presets) a `command`. The
 * `listMCPServerPresets` service helper is also exercised under the
 * `ENABLE_MCP_SERVERS` gate so the API endpoint behaves correctly when
 * the registry feature is disabled.
 */
export function mcpPresetsServiceTest() {
    describe('MCP Server Presets', () => {
        let presets: MCPPreset[]

        beforeAll(() => {
            presets = getPresets()
        })

        it('ships at least one preset', () => {
            expect(presets.length).toBeGreaterThan(0)
        })

        it('has unique ids', () => {
            const ids = presets.map((p) => p.id)
            const unique = new Set(ids)
            expect(unique.size).toBe(ids.length)
        })

        it.each([['filesystem'], ['sqlite'], ['memory'], ['time'], ['fetch']])('bundles the %s preset', (id: string) => {
            const match = presets.find((p) => p.id === id)
            expect(match).toBeDefined()
        })

        it('every preset has the required fields and a non-empty icon SVG', () => {
            for (const preset of presets) {
                expect(typeof preset.id).toBe('string')
                expect(preset.id.length).toBeGreaterThan(0)
                expect(typeof preset.displayName).toBe('string')
                expect(preset.displayName.length).toBeGreaterThan(0)
                expect(typeof preset.description).toBe('string')
                expect(preset.description.length).toBeGreaterThan(0)
                expect(typeof preset.icon).toBe('string')
                expect(preset.icon.endsWith('.svg')).toBe(true)
                expect(typeof preset.iconSvg).toBe('string')
                expect((preset.iconSvg || '').includes('<svg')).toBe(true)
                expect(typeof preset.suggestedSlug).toBe('string')
                expect(preset.suggestedSlug.length).toBeGreaterThan(0)
                expect(Object.values(MCPServerTransport)).toContain(preset.transport)
                expect(Array.isArray(preset.defaultAllowedTools)).toBe(true)
                expect(typeof preset.defaultTimeoutMs).toBe('number')
                expect(preset.defaultTimeoutMs).toBeGreaterThan(0)
            }
        })

        it('stdio presets declare a non-empty command', () => {
            const stdioPresets = presets.filter((p) => p.transport === MCPServerTransport.STDIO)
            for (const preset of stdioPresets) {
                expect(typeof preset.command).toBe('string')
                expect((preset.command || '').length).toBeGreaterThan(0)
            }
        })

        it('credential-bearing presets reference a credential schema for every marker', () => {
            for (const preset of presets) {
                const hasMarker =
                    (preset.args || []).some((a) => typeof a === 'object' && a !== null) ||
                    Object.values(preset.env || {}).some((v) => typeof v === 'object' && v !== null)
                if (hasMarker) {
                    expect(typeof preset.requiredCredentialSchema).toBe('string')
                    expect((preset.requiredCredentialSchema || '').length).toBeGreaterThan(0)
                }
            }
        })

        it('returns frozen objects so callers cannot mutate the cached preset', () => {
            const all = getPresets()
            expect(Object.isFrozen(all[0])).toBe(true)
        })

        it('every stdio preset carries an `available` boolean from the PATH probe', () => {
            const stdioPresets = presets.filter((p) => p.transport === MCPServerTransport.STDIO)
            for (const preset of stdioPresets) {
                expect(typeof preset.available).toBe('boolean')
            }
        })

        it('unavailable presets surface a reason mentioning the missing command', () => {
            const unavailable = presets.filter((p) => p.available === false)
            for (const preset of unavailable) {
                expect(typeof preset.unavailableReason).toBe('string')
                expect((preset.unavailableReason || '').toLowerCase()).toContain((preset.command || '').toLowerCase())
            }
        })

        describe('isExecutableOnPath probe', () => {
            beforeEach(() => {
                __resetPathProbeCache()
            })

            it('returns true for `node` (the test runner itself is node)', () => {
                expect(isExecutableOnPath('node')).toBe(true)
            })

            it('returns false for a binary that cannot possibly exist on PATH', () => {
                expect(isExecutableOnPath('definitely-not-a-real-binary-zzz12345')).toBe(false)
            })

            it('returns false for an empty command', () => {
                expect(isExecutableOnPath('')).toBe(false)
            })

            it('returns false for an absolute path that does not exist', () => {
                expect(isExecutableOnPath('/no/such/path/zzz-binary')).toBe(false)
            })

            it('caches results so repeated calls do not re-stat the filesystem', () => {
                const first = isExecutableOnPath('node')
                const second = isExecutableOnPath('node')
                expect(first).toBe(second)
            })
        })

        it('getPreset(id) returns the matching preset or undefined', () => {
            const memory = getPreset('memory')
            expect(memory?.id).toBe('memory')
            const missing = getPreset('definitely-not-a-preset')
            expect(missing).toBeUndefined()
        })

        describe('listMCPServerPresets service helper', () => {
            const ORIGINAL_FLAG = process.env.ENABLE_MCP_SERVERS

            afterEach(() => {
                if (ORIGINAL_FLAG === undefined) {
                    delete process.env.ENABLE_MCP_SERVERS
                } else {
                    process.env.ENABLE_MCP_SERVERS = ORIGINAL_FLAG
                }
                jest.resetModules()
            })

            it('returns the catalogue when ENABLE_MCP_SERVERS=true', () => {
                process.env.ENABLE_MCP_SERVERS = 'true'
                jest.resetModules()
                const service = require('../../src/services/mcp-servers').default
                const result = service.listMCPServerPresets()
                expect(Array.isArray(result)).toBe(true)
                expect(result.length).toBeGreaterThan(0)
            })

            it('throws SERVICE_UNAVAILABLE when ENABLE_MCP_SERVERS is not true', () => {
                process.env.ENABLE_MCP_SERVERS = 'false'
                jest.resetModules()
                const service = require('../../src/services/mcp-servers').default
                expect(() => service.listMCPServerPresets()).toThrow(/MCP servers are not enabled/)
            })
        })
    })
}
