import { PolicyOutcome } from '../../src/Interface'
import { PolicyState, resolvePolicies, runWithPolicy } from '../../src/services/mcp-gateway/policy'

/**
 * Test suite for v1.8.0 Group A — per-server reliability policy chain.
 * Covers `resolvePolicies` env + JSON merge, `PolicyState` token bucket /
 * circuit breaker mechanics, and the end-to-end `runWithPolicy` wrapper
 * (rate-limit rejection, retry success, circuit open).
 */
export function mcpGatewayPolicyServiceTest() {
    describe('MCP Gateway Policy Service', () => {
        afterEach(() => {
            delete process.env.MCP_DEFAULT_RETRY_MAX_ATTEMPTS
            delete process.env.MCP_DEFAULT_RATE_LIMIT_RPS
        })

        // ─── resolvePolicies ───────────────────────────────────────────

        describe('resolvePolicies', () => {
            it('returns defaults when policies is undefined', () => {
                const resolved = resolvePolicies({})
                expect(resolved.retry.maxAttempts).toBe(3)
                expect(resolved.retry.baseDelayMs).toBe(500)
                expect(resolved.retry.jitter).toBe(true)
                expect(resolved.rateLimit.rps).toBe(0)
                expect(resolved.circuitBreaker.failureThreshold).toBe(5)
                expect(resolved.circuitBreaker.openMs).toBe(30000)
            })

            it('returns defaults when policies is malformed JSON', () => {
                const resolved = resolvePolicies({ policies: 'not-json' })
                expect(resolved.retry.maxAttempts).toBe(3)
            })

            it('returns defaults when policies parses to non-object', () => {
                const resolved = resolvePolicies({ policies: '[1,2,3]' })
                expect(resolved.retry.maxAttempts).toBe(3)
            })

            it('honours stored retry overrides', () => {
                const resolved = resolvePolicies({
                    policies: JSON.stringify({ retry: { maxAttempts: 5, baseDelayMs: 100, jitter: false } })
                })
                expect(resolved.retry).toEqual({ maxAttempts: 5, baseDelayMs: 100, jitter: false })
            })

            it('falls back per-field when only some retry keys are set', () => {
                const resolved = resolvePolicies({ policies: JSON.stringify({ retry: { maxAttempts: 7 } }) })
                expect(resolved.retry.maxAttempts).toBe(7)
                expect(resolved.retry.baseDelayMs).toBe(500)
                expect(resolved.retry.jitter).toBe(true)
            })

            it('honours stored rate-limit overrides', () => {
                const resolved = resolvePolicies({
                    policies: JSON.stringify({ rateLimit: { rps: 10, burst: 20 } })
                })
                expect(resolved.rateLimit).toEqual({ rps: 10, burst: 20 })
            })

            it('honours stored circuit-breaker overrides', () => {
                const resolved = resolvePolicies({
                    policies: JSON.stringify({ circuitBreaker: { failureThreshold: 2, openMs: 5000 } })
                })
                expect(resolved.circuitBreaker).toEqual({ failureThreshold: 2, openMs: 5000 })
            })

            it('picks up env-default for retry maxAttempts', () => {
                process.env.MCP_DEFAULT_RETRY_MAX_ATTEMPTS = '7'
                const resolved = resolvePolicies({})
                expect(resolved.retry.maxAttempts).toBe(7)
            })

            it('picks up env-default for rate-limit rps', () => {
                process.env.MCP_DEFAULT_RATE_LIMIT_RPS = '15'
                const resolved = resolvePolicies({})
                expect(resolved.rateLimit.rps).toBe(15)
            })

            it('rejects negative numeric overrides and falls back to default', () => {
                const resolved = resolvePolicies({ policies: JSON.stringify({ retry: { maxAttempts: -1 } }) })
                expect(resolved.retry.maxAttempts).toBe(3)
            })
        })

        // ─── PolicyState — rate limit ────────────────────────────────

        describe('PolicyState.takeRateLimitToken', () => {
            it('allows every call when rps is 0 (unlimited sentinel)', () => {
                const state = new PolicyState()
                for (let i = 0; i < 100; i++) {
                    expect(state.takeRateLimitToken('s1', { rps: 0, burst: 0 })).toBe(true)
                }
            })

            it('exhausts the bucket and rejects further calls at the configured rps', () => {
                const state = new PolicyState()
                const policy = { rps: 2, burst: 0 }
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(true)
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(true)
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(false)
            })

            it('refills the bucket as wall-clock time elapses', () => {
                const state = new PolicyState()
                const policy = { rps: 2, burst: 0 }
                state.takeRateLimitToken('s1', policy, 1000)
                state.takeRateLimitToken('s1', policy, 1000)
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(false)
                expect(state.takeRateLimitToken('s1', policy, 2000)).toBe(true)
            })

            it('honours an explicit burst capacity', () => {
                const state = new PolicyState()
                const policy = { rps: 1, burst: 5 }
                for (let i = 0; i < 5; i++) {
                    expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(true)
                }
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(false)
            })

            it('isolates buckets per server', () => {
                const state = new PolicyState()
                const policy = { rps: 1, burst: 0 }
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(true)
                expect(state.takeRateLimitToken('s1', policy, 1000)).toBe(false)
                expect(state.takeRateLimitToken('s2', policy, 1000)).toBe(true)
            })
        })

        // ─── PolicyState — circuit breaker ───────────────────────────

        describe('PolicyState circuit breaker', () => {
            const policy = { failureThreshold: 3, openMs: 10000 }

            it('stays CLOSED while consecutive failures are below threshold', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                expect(state.checkBreaker('s1', policy, 1000)).toBeNull()
                expect(state.peekBreakerState('s1')).toBe('CLOSED')
            })

            it('opens after the threshold is hit and rejects further calls', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                expect(state.peekBreakerState('s1')).toBe('OPEN')
                expect(state.checkBreaker('s1', policy, 1000)).toBe('OPEN')
            })

            it('transitions to HALF_OPEN after openMs has elapsed', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                expect(state.checkBreaker('s1', policy, 1000 + 10000)).toBeNull()
                expect(state.peekBreakerState('s1')).toBe('HALF_OPEN')
            })

            it('re-opens after a HALF_OPEN trial failure', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.checkBreaker('s1', policy, 1000 + 10000) // transitions to HALF_OPEN
                state.recordFailure('s1', policy, 1000 + 10001)
                expect(state.peekBreakerState('s1')).toBe('OPEN')
            })

            it('closes after a HALF_OPEN trial success', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.checkBreaker('s1', policy, 1000 + 10000) // → HALF_OPEN
                state.recordSuccess('s1')
                expect(state.peekBreakerState('s1')).toBe('CLOSED')
            })

            it('is disabled when failureThreshold is 0', () => {
                const state = new PolicyState()
                const disabledPolicy = { failureThreshold: 0, openMs: 10000 }
                for (let i = 0; i < 10; i++) state.recordFailure('s1', disabledPolicy, 1000)
                expect(state.checkBreaker('s1', disabledPolicy, 1000)).toBeNull()
            })

            it('resets consecutive failures on a success', () => {
                const state = new PolicyState()
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                state.recordSuccess('s1')
                state.recordFailure('s1', policy, 1000)
                state.recordFailure('s1', policy, 1000)
                expect(state.peekBreakerState('s1')).toBe('CLOSED')
            })
        })

        // ─── runWithPolicy ──────────────────────────────────────────

        describe('runWithPolicy', () => {
            const policies = {
                retry: { maxAttempts: 3, baseDelayMs: 1, jitter: false },
                rateLimit: { rps: 0, burst: 0 },
                circuitBreaker: { failureThreshold: 2, openMs: 1000 }
            }
            const clock = { now: () => 1000, sleep: () => Promise.resolve() }

            it('returns PASSED on first-attempt success', async () => {
                const state = new PolicyState()
                const doInvoke = jest.fn().mockResolvedValue('ok')
                const out = await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies, state, doInvoke }, clock)
                expect(out.result).toBe('ok')
                expect(out.outcome).toBe(PolicyOutcome.PASSED)
                expect(out.attempts).toBe(1)
                expect(doInvoke).toHaveBeenCalledTimes(1)
            })

            it('returns RETRIED when the call succeeds after a failure', async () => {
                const state = new PolicyState()
                const doInvoke = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('ok')
                const out = await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies, state, doInvoke }, clock)
                expect(out.outcome).toBe(PolicyOutcome.RETRIED)
                expect(out.attempts).toBe(2)
            })

            it('throws after exhausting all retry attempts', async () => {
                const state = new PolicyState()
                const doInvoke = jest.fn().mockRejectedValue(new Error('always-fails'))
                await expect(runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies, state, doInvoke }, clock)).rejects.toThrow(
                    'always-fails'
                )
                expect(doInvoke).toHaveBeenCalledTimes(3)
            })

            it('rejects with RATE_LIMITED when the rate-limit gate fires', async () => {
                const state = new PolicyState()
                const limited = { ...policies, rateLimit: { rps: 1, burst: 0 } }
                const doInvoke = jest.fn().mockResolvedValue('ok')
                await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies: limited, state, doInvoke }, clock)
                let caught: any = null
                try {
                    await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies: limited, state, doInvoke }, clock)
                } catch (error) {
                    caught = error
                }
                expect(caught).toBeTruthy()
                expect(caught.statusCode).toBe(429)
                expect(caught.policyOutcome).toBe(PolicyOutcome.RATE_LIMITED)
            })

            it('rejects with CIRCUIT_OPEN once the breaker opens', async () => {
                const state = new PolicyState()
                const breaking = {
                    ...policies,
                    retry: { maxAttempts: 1, baseDelayMs: 1, jitter: false }
                }
                const doInvoke = jest.fn().mockRejectedValue(new Error('bad'))
                await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies: breaking, state, doInvoke }, clock).catch(() => null)
                await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies: breaking, state, doInvoke }, clock).catch(() => null)
                let caught: any = null
                try {
                    await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies: breaking, state, doInvoke }, clock)
                } catch (error) {
                    caught = error
                }
                expect(caught).toBeTruthy()
                expect(caught.statusCode).toBe(503)
                expect(caught.policyOutcome).toBe(PolicyOutcome.CIRCUIT_OPEN)
            })

            it('closes the breaker after a successful retry', async () => {
                const state = new PolicyState()
                const doInvoke = jest.fn().mockRejectedValueOnce(new Error('once')).mockResolvedValueOnce('ok')
                await runWithPolicy({ serverId: 's1', serverSlug: 'srv', policies, state, doInvoke }, clock)
                expect(state.peekBreakerState('s1')).toBe('CLOSED')
            })
        })
    })
}
