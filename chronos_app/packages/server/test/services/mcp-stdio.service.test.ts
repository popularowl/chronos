import {
    StdioBackoffState,
    STDIO_UNHEALTHY_FAILURE_THRESHOLD,
    parseStdioConfig,
    readStdioRuntimeEnv,
    resolveStdioConfig
} from '../../src/services/mcp-gateway/stdio'

/**
 * Test suite for stdio transport pure helpers.
 *
 * Covers `parseStdioConfig` (JSON validation), `resolveStdioConfig`
 * (credential reference resolution + argv `{{credentialId:field}}` token
 * interpolation), `StdioBackoffState` (consecutive-failure tracking +
 * exponential window math), and `readStdioRuntimeEnv` (env var parsing
 * with sensible defaults).
 *
 * The SDK-backed `StdioClientTransport` is intentionally not exercised
 * here — spawning real child processes belongs to the docker smoke; this
 * suite focuses on the credential-resolution path and backoff math that
 * Chronos owns end-to-end.
 */
export function mcpStdioServiceTest() {
    describe('MCP Gateway — stdio helpers', () => {
        const baseServer = (overrides: Record<string, unknown> = {}) => ({
            id: 'srv-stdio-1',
            slug: 'postgres-local',
            command: 'npx',
            args: undefined as string | undefined,
            env: undefined as string | undefined,
            transport: 'stdio',
            ...overrides
        })

        // ─── parseStdioConfig ──────────────────────────────────────────

        describe('parseStdioConfig', () => {
            it('rejects a row with no command', () => {
                const server = baseServer({ command: undefined })
                expect(() => parseStdioConfig(server as any)).toThrow(/no command/i)
            })

            it('rejects a row with empty-string command', () => {
                const server = baseServer({ command: '   ' })
                expect(() => parseStdioConfig(server as any)).toThrow(/no command/i)
            })

            it('returns empty args + env when only command is set', () => {
                const parsed = parseStdioConfig(baseServer() as any)
                expect(parsed.command).toBe('npx')
                expect(parsed.argTokens).toEqual([])
                expect(parsed.envEntries).toEqual([])
            })

            it('parses a valid args JSON array', () => {
                const server = baseServer({
                    args: JSON.stringify(['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/db'])
                })
                const parsed = parseStdioConfig(server as any)
                expect(parsed.argTokens).toEqual(['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/db'])
            })

            it('rejects args that is not valid JSON', () => {
                const server = baseServer({ args: 'not-json' })
                expect(() => parseStdioConfig(server as any)).toThrow(/not valid JSON/i)
            })

            it('rejects args that is not a JSON array', () => {
                const server = baseServer({ args: JSON.stringify({ a: 1 }) })
                expect(() => parseStdioConfig(server as any)).toThrow(/must be a JSON array/i)
            })

            it('rejects args containing a non-string element', () => {
                const server = baseServer({ args: JSON.stringify(['ok', 42]) })
                expect(() => parseStdioConfig(server as any)).toThrow(/non-string/i)
            })

            it('parses env with inline string values', () => {
                const server = baseServer({
                    env: JSON.stringify({ NODE_ENV: 'production', GREETING: 'hello' })
                })
                const parsed = parseStdioConfig(server as any)
                expect(parsed.envEntries).toEqual([
                    { key: 'NODE_ENV', value: 'production' },
                    { key: 'GREETING', value: 'hello' }
                ])
            })

            it('parses env with credential reference values', () => {
                const server = baseServer({
                    env: JSON.stringify({
                        GITHUB_PERSONAL_ACCESS_TOKEN: { credentialId: 'cred-1', field: 'token' }
                    })
                })
                const parsed = parseStdioConfig(server as any)
                expect(parsed.envEntries).toEqual([
                    { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: { credentialId: 'cred-1', field: 'token' } }
                ])
            })

            it('rejects env value that is neither string nor credential ref', () => {
                const server = baseServer({ env: JSON.stringify({ FOO: 42 }) })
                expect(() => parseStdioConfig(server as any)).toThrow(/must be a string or a \{credentialId, field\}/i)
            })

            it('rejects env value that is an array', () => {
                const server = baseServer({ env: JSON.stringify({ FOO: ['a', 'b'] }) })
                expect(() => parseStdioConfig(server as any)).toThrow(/must be a string or a \{credentialId, field\}/i)
            })

            it('rejects env that is a JSON array rather than object', () => {
                const server = baseServer({ env: JSON.stringify(['x']) })
                expect(() => parseStdioConfig(server as any)).toThrow(/must be a JSON object/i)
            })
        })

        // ─── resolveStdioConfig ──────────────────────────────────────────

        describe('resolveStdioConfig', () => {
            it('passes through inline string env values verbatim', async () => {
                const parsed = parseStdioConfig(baseServer({ env: JSON.stringify({ FOO: 'bar' }) }) as any)
                const fetchCredential = jest.fn()
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.env).toEqual({ FOO: 'bar' })
                expect(fetchCredential).not.toHaveBeenCalled()
            })

            it('decrypts a credential reference into the env string', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        env: JSON.stringify({ GITHUB_PERSONAL_ACCESS_TOKEN: { credentialId: 'cred-1', field: 'token' } })
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ token: 'ghp_secretvalue' })
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secretvalue' })
                expect(fetchCredential).toHaveBeenCalledWith('cred-1')
            })

            it('caches a credential so the same id is decrypted once across multiple references', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        env: JSON.stringify({
                            TOKEN_A: { credentialId: 'cred-1', field: 'token' },
                            TOKEN_B: { credentialId: 'cred-1', field: 'token' }
                        })
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ token: 'shared' })
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.env).toEqual({ TOKEN_A: 'shared', TOKEN_B: 'shared' })
                expect(fetchCredential).toHaveBeenCalledTimes(1)
            })

            it('throws when a credential is missing the named field', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        env: JSON.stringify({ FOO: { credentialId: 'cred-1', field: 'missing' } })
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ token: 'ghp_secret' })
                await expect(resolveStdioConfig(parsed, { fetchCredential })).rejects.toThrow(/no string field "missing"/i)
            })

            it('throws when a credential field is not a string', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        env: JSON.stringify({ FOO: { credentialId: 'cred-1', field: 'maybeNumber' } })
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ maybeNumber: 42 })
                await expect(resolveStdioConfig(parsed, { fetchCredential })).rejects.toThrow(/no string field "maybeNumber"/i)
            })

            it('interpolates a {{credentialId:field}} token inside an argv string', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        args: JSON.stringify(['postgresql://user:{{cred-1:password}}@localhost/db'])
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ password: 's3cr3t' })
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.args).toEqual(['postgresql://user:s3cr3t@localhost/db'])
                expect(fetchCredential).toHaveBeenCalledWith('cred-1')
            })

            it('interpolates multiple tokens in a single argv string', async () => {
                const parsed = parseStdioConfig(
                    baseServer({
                        args: JSON.stringify(['{{cred-1:user}}:{{cred-1:password}}@host'])
                    }) as any
                )
                const fetchCredential = jest.fn().mockResolvedValue({ user: 'admin', password: 's3cr3t' })
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.args).toEqual(['admin:s3cr3t@host'])
                expect(fetchCredential).toHaveBeenCalledTimes(1)
            })

            it('leaves argv strings without tokens untouched', async () => {
                const parsed = parseStdioConfig(
                    baseServer({ args: JSON.stringify(['-y', '@modelcontextprotocol/server-postgres']) }) as any
                )
                const fetchCredential = jest.fn()
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.args).toEqual(['-y', '@modelcontextprotocol/server-postgres'])
                expect(fetchCredential).not.toHaveBeenCalled()
            })

            it('throws on argv token referencing a missing field', async () => {
                const parsed = parseStdioConfig(baseServer({ args: JSON.stringify(['{{cred-1:missing}}']) }) as any)
                const fetchCredential = jest.fn().mockResolvedValue({ other: 'value' })
                await expect(resolveStdioConfig(parsed, { fetchCredential })).rejects.toThrow(
                    /no string field "missing" for argv interpolation/i
                )
            })

            it('tolerates whitespace around the token separator', async () => {
                const parsed = parseStdioConfig(baseServer({ args: JSON.stringify(['{{ cred-1 : password }}']) }) as any)
                const fetchCredential = jest.fn().mockResolvedValue({ password: 'whitespace-tolerant' })
                const resolved = await resolveStdioConfig(parsed, { fetchCredential })
                expect(resolved.args).toEqual(['whitespace-tolerant'])
            })
        })

        // ─── StdioBackoffState ───────────────────────────────────────────

        describe('StdioBackoffState', () => {
            const baseEnv = {
                restartBackoffMs: 1000,
                restartBackoffMaxMs: 60_000,
                stderrLogLevel: 'info' as const,
                shutdownGraceMs: 5000
            }

            it('allows the first call when no failure has been recorded', () => {
                const state = new StdioBackoffState()
                expect(state.allowedNow('srv-1', 1000)).toEqual({ allowed: true, retryInMs: 0 })
                expect(state.failureCount('srv-1')).toBe(0)
            })

            it('blocks a retry inside the backoff window after one failure', () => {
                const state = new StdioBackoffState()
                state.recordFailure('srv-1', baseEnv, 1000)
                const status = state.allowedNow('srv-1', 1500)
                expect(status.allowed).toBe(false)
                expect(status.retryInMs).toBe(500)
            })

            it('allows a retry after the backoff window elapses', () => {
                const state = new StdioBackoffState()
                state.recordFailure('srv-1', baseEnv, 1000)
                expect(state.allowedNow('srv-1', 2001).allowed).toBe(true)
            })

            it('doubles the backoff window on each consecutive failure', () => {
                const state = new StdioBackoffState()
                state.recordFailure('srv-1', baseEnv, 1000) // 1s window → 2000
                state.recordFailure('srv-1', baseEnv, 2000) // 2s window → 4000
                state.recordFailure('srv-1', baseEnv, 4000) // 4s window → 8000
                expect(state.allowedNow('srv-1', 4500).retryInMs).toBe(3500)
                expect(state.failureCount('srv-1')).toBe(3)
            })

            it('caps the backoff window at restartBackoffMaxMs', () => {
                const state = new StdioBackoffState()
                // 10 consecutive failures with 1s base would overshoot the 60s cap
                let now = 0
                for (let i = 0; i < 10; i++) {
                    state.recordFailure('srv-1', baseEnv, now)
                    now += 1
                }
                const status = state.allowedNow('srv-1', now)
                expect(status.retryInMs).toBeLessThanOrEqual(baseEnv.restartBackoffMaxMs)
                // exact value: the 10th failure produced window min(1000 * 2^9, 60000) = 60000
                expect(status.retryInMs).toBe(60_000 - 1)
            })

            it('recordSuccess resets the failure counter and clears the window', () => {
                const state = new StdioBackoffState()
                state.recordFailure('srv-1', baseEnv, 1000)
                state.recordFailure('srv-1', baseEnv, 2000)
                state.recordSuccess('srv-1')
                expect(state.failureCount('srv-1')).toBe(0)
                expect(state.allowedNow('srv-1', 2001)).toEqual({ allowed: true, retryInMs: 0 })
            })

            it('isolates state per server id', () => {
                const state = new StdioBackoffState()
                state.recordFailure('srv-1', baseEnv, 1000)
                expect(state.allowedNow('srv-2', 1100)).toEqual({ allowed: true, retryInMs: 0 })
            })

            it('reaches the UNHEALTHY threshold after 3 consecutive failures', () => {
                const state = new StdioBackoffState()
                let now = 0
                for (let i = 0; i < STDIO_UNHEALTHY_FAILURE_THRESHOLD; i++) {
                    state.recordFailure('srv-1', baseEnv, now)
                    now += baseEnv.restartBackoffMaxMs + 1
                }
                expect(state.failureCount('srv-1')).toBe(STDIO_UNHEALTHY_FAILURE_THRESHOLD)
            })
        })

        // ─── readStdioRuntimeEnv ─────────────────────────────────────────

        describe('readStdioRuntimeEnv', () => {
            const captured = {
                restartBackoff: process.env.MCP_STDIO_RESTART_BACKOFF_MS,
                restartBackoffMax: process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS,
                stderrLevel: process.env.MCP_STDIO_STDERR_LOG_LEVEL,
                shutdownGrace: process.env.MCP_STDIO_SHUTDOWN_GRACE_MS
            }

            afterEach(() => {
                if (captured.restartBackoff === undefined) delete process.env.MCP_STDIO_RESTART_BACKOFF_MS
                else process.env.MCP_STDIO_RESTART_BACKOFF_MS = captured.restartBackoff
                if (captured.restartBackoffMax === undefined) delete process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS
                else process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS = captured.restartBackoffMax
                if (captured.stderrLevel === undefined) delete process.env.MCP_STDIO_STDERR_LOG_LEVEL
                else process.env.MCP_STDIO_STDERR_LOG_LEVEL = captured.stderrLevel
                if (captured.shutdownGrace === undefined) delete process.env.MCP_STDIO_SHUTDOWN_GRACE_MS
                else process.env.MCP_STDIO_SHUTDOWN_GRACE_MS = captured.shutdownGrace
            })

            it('returns documented defaults when no env vars are set', () => {
                delete process.env.MCP_STDIO_RESTART_BACKOFF_MS
                delete process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS
                delete process.env.MCP_STDIO_STDERR_LOG_LEVEL
                delete process.env.MCP_STDIO_SHUTDOWN_GRACE_MS
                const env = readStdioRuntimeEnv()
                expect(env).toEqual({
                    restartBackoffMs: 1000,
                    restartBackoffMaxMs: 60_000,
                    stderrLogLevel: 'info',
                    shutdownGraceMs: 5000
                })
            })

            it('honours valid numeric overrides', () => {
                process.env.MCP_STDIO_RESTART_BACKOFF_MS = '2000'
                process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS = '120000'
                process.env.MCP_STDIO_SHUTDOWN_GRACE_MS = '10000'
                const env = readStdioRuntimeEnv()
                expect(env.restartBackoffMs).toBe(2000)
                expect(env.restartBackoffMaxMs).toBe(120_000)
                expect(env.shutdownGraceMs).toBe(10_000)
            })

            it('falls back to default for non-numeric overrides', () => {
                process.env.MCP_STDIO_RESTART_BACKOFF_MS = 'abc'
                expect(readStdioRuntimeEnv().restartBackoffMs).toBe(1000)
            })

            it('falls back to default for zero / negative overrides', () => {
                process.env.MCP_STDIO_RESTART_BACKOFF_MS = '0'
                expect(readStdioRuntimeEnv().restartBackoffMs).toBe(1000)
                process.env.MCP_STDIO_RESTART_BACKOFF_MS = '-100'
                expect(readStdioRuntimeEnv().restartBackoffMs).toBe(1000)
            })

            it('honours MCP_STDIO_STDERR_LOG_LEVEL=debug', () => {
                process.env.MCP_STDIO_STDERR_LOG_LEVEL = 'debug'
                expect(readStdioRuntimeEnv().stderrLogLevel).toBe('debug')
            })

            it('treats any non-debug value as info', () => {
                process.env.MCP_STDIO_STDERR_LOG_LEVEL = 'warn'
                expect(readStdioRuntimeEnv().stderrLogLevel).toBe('info')
                process.env.MCP_STDIO_STDERR_LOG_LEVEL = ''
                expect(readStdioRuntimeEnv().stderrLogLevel).toBe('info')
            })

            it('is case-insensitive for the log level', () => {
                process.env.MCP_STDIO_STDERR_LOG_LEVEL = 'DEBUG'
                expect(readStdioRuntimeEnv().stderrLogLevel).toBe('debug')
            })
        })
    })
}
