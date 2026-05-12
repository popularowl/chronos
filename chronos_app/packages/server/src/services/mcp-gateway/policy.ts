import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import { PolicyOutcome } from '../../Interface'
import { createModuleLogger } from '../../utils/logger'

const logger = createModuleLogger('MCPGatewayPolicy')

/**
 * Persisted policy bag stored as JSON in `MCPServer.policies`. Each
 * top-level key is optional; absent keys fall back to the platform default
 * resolved from env vars.
 */
export interface MCPServerPolicies {
    retry?: RetryPolicy
    rateLimit?: RateLimitPolicy
    circuitBreaker?: CircuitBreakerPolicy
}

export interface RetryPolicy {
    /** Number of attempts including the first try (so `1` = no retries). */
    maxAttempts: number
    /** First backoff delay; subsequent delays double (cap not implemented). */
    baseDelayMs: number
    /** Apply ±50% jitter to each backoff. Default `true`. */
    jitter: boolean
}

export interface RateLimitPolicy {
    /** Sustained request rate, requests-per-second. `0` = unlimited. */
    rps: number
    /** Maximum burst size. `0` = matches `rps` (no extra burst headroom). */
    burst: number
}

export interface CircuitBreakerPolicy {
    /** Open the breaker after this many consecutive failures. `0` = disabled. */
    failureThreshold: number
    /** How long to stay open before allowing a half-open trial call. */
    openMs: number
}

/**
 * Resolved policy bag — every field populated, ready to drive the chain.
 * The output of `resolvePolicies(server)`.
 */
export interface ResolvedPolicies {
    retry: RetryPolicy
    rateLimit: RateLimitPolicy
    circuitBreaker: CircuitBreakerPolicy
}

const DEFAULT_RETRY_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_RATE_LIMIT_RPS = 0
const DEFAULT_RATE_LIMIT_BURST = 0
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 5
const DEFAULT_CIRCUIT_OPEN_MS = 30000

const readEnvInt = (name: string, fallback: number): number => {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Resolves `server.policies` (nullable JSON) into a fully-populated
 * `ResolvedPolicies`. Pulls per-field defaults from env vars
 * (`MCP_DEFAULT_RETRY_MAX_ATTEMPTS`, `MCP_DEFAULT_RATE_LIMIT_RPS`), so
 * platform-wide defaults can be tuned without touching every registered
 * server. Malformed JSON or missing sub-fields silently fall back to
 * defaults rather than throwing — the policy chain must never break a
 * call because the stored policy doc is partially valid.
 */
export const resolvePolicies = (server: { policies?: string }): ResolvedPolicies => {
    let parsed: MCPServerPolicies = {}
    if (server.policies) {
        try {
            const candidate = JSON.parse(server.policies)
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                parsed = candidate as MCPServerPolicies
            }
        } catch {
            // Stored policy is malformed; behave as if no policy is set.
        }
    }

    const envRetryMax = readEnvInt('MCP_DEFAULT_RETRY_MAX_ATTEMPTS', DEFAULT_RETRY_MAX_ATTEMPTS)
    const envRateRps = readEnvInt('MCP_DEFAULT_RATE_LIMIT_RPS', DEFAULT_RATE_LIMIT_RPS)

    const retry: RetryPolicy = {
        maxAttempts: positiveInt(parsed.retry?.maxAttempts, envRetryMax),
        baseDelayMs: positiveInt(parsed.retry?.baseDelayMs, DEFAULT_RETRY_BASE_DELAY_MS),
        jitter: parsed.retry?.jitter ?? true
    }
    const rateLimit: RateLimitPolicy = {
        rps: nonNegativeInt(parsed.rateLimit?.rps, envRateRps),
        burst: nonNegativeInt(parsed.rateLimit?.burst, DEFAULT_RATE_LIMIT_BURST)
    }
    const circuitBreaker: CircuitBreakerPolicy = {
        failureThreshold: nonNegativeInt(parsed.circuitBreaker?.failureThreshold, DEFAULT_CIRCUIT_FAILURE_THRESHOLD),
        openMs: positiveInt(parsed.circuitBreaker?.openMs, DEFAULT_CIRCUIT_OPEN_MS)
    }
    return { retry, rateLimit, circuitBreaker }
}

const positiveInt = (value: number | undefined, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback
    return Math.floor(value)
}

const nonNegativeInt = (value: number | undefined, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
    return Math.floor(value)
}

/**
 * Per-server token-bucket state, kept in-memory for v1.8.0 per locked
 * (Redis-backed shared state is a v1.8.x patch). One bucket
 * per `mcpServerId`, lazily created.
 */
interface BucketState {
    tokens: number
    lastRefillAt: number
}

/**
 * Per-server circuit-breaker state. CLOSED is the normal flow. OPEN
 * short-circuits with `CIRCUIT_OPEN`. HALF_OPEN is reached after `openMs`
 * elapses — the next call is a trial; success closes the breaker, failure
 * re-opens it.
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface BreakerState {
    state: CircuitState
    consecutiveFailures: number
    openedAt: number
}

/**
 * Token-bucket rate limiter + per-server circuit breaker. Stateful across
 * calls; kept in-memory (locked decision #11 — Redis state lands in
 * v1.8.x). Constructed once per `MCPGateway` instance and shared across
 * all invocations.
 */
export class PolicyState {
    private buckets: Map<string, BucketState> = new Map()
    private breakers: Map<string, BreakerState> = new Map()

    /**
     * Returns `true` if the call is allowed under the rate-limit policy.
     * `rps === 0` is a sentinel for "unlimited" — short-circuits to allow.
     * Otherwise refills the bucket based on elapsed wall time and consumes
     * one token.
     */
    public takeRateLimitToken(serverId: string, policy: RateLimitPolicy, now: number = Date.now()): boolean {
        if (policy.rps <= 0) return true
        const capacity = policy.burst > 0 ? policy.burst : policy.rps
        const bucket = this.buckets.get(serverId) ?? { tokens: capacity, lastRefillAt: now }
        const elapsedSec = Math.max(0, (now - bucket.lastRefillAt) / 1000)
        const refill = elapsedSec * policy.rps
        const tokens = Math.min(capacity, bucket.tokens + refill)
        if (tokens < 1) {
            this.buckets.set(serverId, { tokens, lastRefillAt: now })
            return false
        }
        this.buckets.set(serverId, { tokens: tokens - 1, lastRefillAt: now })
        return true
    }

    /**
     * Returns the breaker decision for the next call. `CIRCUIT_OPEN` means
     * the call must be short-circuited; `null` means proceed. An OPEN
     * breaker that has aged past `openMs` is transitioned to HALF_OPEN
     * here so the caller's call becomes the trial.
     */
    public checkBreaker(serverId: string, policy: CircuitBreakerPolicy, now: number = Date.now()): 'OPEN' | null {
        if (policy.failureThreshold <= 0) return null
        const breaker = this.breakers.get(serverId)
        if (!breaker || breaker.state === 'CLOSED') return null
        if (breaker.state === 'OPEN') {
            if (now - breaker.openedAt >= policy.openMs) {
                breaker.state = 'HALF_OPEN'
                return null
            }
            return 'OPEN'
        }
        // HALF_OPEN — let the trial through.
        return null
    }

    /**
     * Record success — resets consecutive-failure count and closes the
     * breaker if it was HALF_OPEN.
     */
    public recordSuccess(serverId: string): void {
        const breaker = this.breakers.get(serverId)
        if (!breaker) return
        breaker.consecutiveFailures = 0
        breaker.state = 'CLOSED'
    }

    /**
     * Record failure — increments the consecutive count and opens the
     * breaker once the threshold is hit. A HALF_OPEN trial failure also
     * re-opens immediately.
     */
    public recordFailure(serverId: string, policy: CircuitBreakerPolicy, now: number = Date.now()): void {
        if (policy.failureThreshold <= 0) return
        const breaker = this.breakers.get(serverId) ?? { state: 'CLOSED' as CircuitState, consecutiveFailures: 0, openedAt: 0 }
        breaker.consecutiveFailures += 1
        if (breaker.state === 'HALF_OPEN' || breaker.consecutiveFailures >= policy.failureThreshold) {
            breaker.state = 'OPEN'
            breaker.openedAt = now
        }
        this.breakers.set(serverId, breaker)
    }

    /** Test seam — current breaker state for the given server. */
    public peekBreakerState(serverId: string): CircuitState {
        return this.breakers.get(serverId)?.state ?? 'CLOSED'
    }

    /** Test seam — clear all in-memory state. */
    public reset(): void {
        this.buckets.clear()
        this.breakers.clear()
    }
}

/**
 * Result of `runWithPolicy` — carries the policy verdict alongside the
 * underlying call's return. Caller passes `outcome` through to the audit
 * row. On policy-rejection (`RATE_LIMITED` / `CIRCUIT_OPEN`) the wrapper
 * throws an `InternalChronosError` instead of returning, so the result
 * shape only applies to the success / retry-succeeded path.
 */
export interface PolicyRunResult<T> {
    result: T
    outcome: PolicyOutcome
    attempts: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const applyJitter = (delayMs: number, jitter: boolean): number => {
    if (!jitter) return delayMs
    // ±50% jitter — keeps backoff bounded and avoids thundering-herd retry
    // alignment across multiple gateway instances.
    const factor = 0.5 + Math.random()
    return Math.max(0, Math.floor(delayMs * factor))
}

/**
 * Wraps an MCP `tools/call` (or any per-server operation) with the
 * configured policy chain. Order: rate-limit gate → circuit-breaker check
 * → retry loop wrapping the underlying `doInvoke()`. On policy rejection
 * (rate-limited or circuit open) throws `InternalChronosError` with the
 * appropriate HTTP status — the caller is expected to translate that to
 * the right audit row (`PolicyOutcome` already carried on the error).
 *
 * Retries fire on any thrown error from `doInvoke()`. The chain does not
 * inspect error shapes — retrying on a 4xx error here is the operator's
 * stated policy and is preserved verbatim. Operators who don't want that
 * set `retry.maxAttempts: 1`.
 */
export const runWithPolicy = async <T>(
    options: {
        serverId: string
        serverSlug: string
        policies: ResolvedPolicies
        state: PolicyState
        doInvoke: () => Promise<T>
    },
    clock: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<PolicyRunResult<T>> => {
    const now = clock.now ?? Date.now
    const wait = clock.sleep ?? sleep
    const { serverId, serverSlug, policies, state, doInvoke } = options

    if (!state.takeRateLimitToken(serverId, policies.rateLimit, now())) {
        logger.warn(`Rate-limit rejected call for server ${serverSlug}`)
        const err = new InternalChronosError(
            StatusCodes.TOO_MANY_REQUESTS,
            `MCP server ${serverSlug} is rate-limited (rps=${policies.rateLimit.rps})`
        )
        ;(err as any).policyOutcome = PolicyOutcome.RATE_LIMITED
        throw err
    }

    if (state.checkBreaker(serverId, policies.circuitBreaker, now()) === 'OPEN') {
        logger.warn(`Circuit breaker open for server ${serverSlug}; rejecting call`)
        const err = new InternalChronosError(StatusCodes.SERVICE_UNAVAILABLE, `MCP server ${serverSlug} circuit breaker is open`)
        ;(err as any).policyOutcome = PolicyOutcome.CIRCUIT_OPEN
        throw err
    }

    const maxAttempts = Math.max(1, policies.retry.maxAttempts)
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await doInvoke()
            state.recordSuccess(serverId)
            return {
                result,
                outcome: attempt > 1 ? PolicyOutcome.RETRIED : PolicyOutcome.PASSED,
                attempts: attempt
            }
        } catch (error) {
            lastError = error
            state.recordFailure(serverId, policies.circuitBreaker, now())
            if (attempt < maxAttempts) {
                const backoff = applyJitter(policies.retry.baseDelayMs * Math.pow(2, attempt - 1), policies.retry.jitter)
                logger.warn(`Call to ${serverSlug} failed (attempt ${attempt}/${maxAttempts}); retrying in ${backoff}ms`)
                await wait(backoff)
            }
        }
    }
    // All attempts exhausted — re-throw the last error with the RETRIED
    // outcome tagged so the gateway can pass it through to the audit row.
    if (lastError && typeof lastError === 'object') {
        ;(lastError as any).policyOutcome = maxAttempts > 1 ? PolicyOutcome.RETRIED : PolicyOutcome.PASSED
    }
    throw lastError
}
