import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Credential } from '../../database/entities/Credential'
import { MCPServer } from '../../database/entities/MCPServer'
import { StdioCredentialRef, StdioEnvValue } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { StatusCodes } from 'http-status-codes'
import { getErrorMessage } from '../../errors/utils'
import { decryptCredentialData } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createModuleLogger } from '../../utils/logger'

const logger = createModuleLogger('MCPGateway.stdio')

/**
 * Default initial backoff between consecutive stdio spawn failures. Doubles
 * on each consecutive failure, capped by `MCP_STDIO_RESTART_BACKOFF_MAX_MS`.
 */
const DEFAULT_RESTART_BACKOFF_MS = 1000

/** Default cap on the exponential backoff between stdio respawn attempts. */
const DEFAULT_RESTART_BACKOFF_MAX_MS = 60_000

/** Default best-effort upper bound on stdio child shutdown duration. */
const DEFAULT_SHUTDOWN_GRACE_MS = 5000

/**
 * Consecutive spawn-failure count that flips an `MCPServer` to UNHEALTHY.
 * Once the threshold is reached the gateway returns 503 for subsequent
 * invocations and the next health poll attempts a fresh spawn — a single
 * successful spawn resets the counter and re-marks the row HEALTHY.
 */
export const STDIO_UNHEALTHY_FAILURE_THRESHOLD = 3

/**
 * Interpolation token pattern `{{credentialId:field}}` embedded inside an
 * `args` string. Multiple tokens per string are supported; whitespace around
 * the colon is tolerated.
 */
const ARG_INTERPOLATION_PATTERN = /\{\{\s*([^:\s}]+)\s*:\s*([^\s}]+)\s*\}\}/g

/**
 * Resolved env vars controlling stdio lifecycle. Read once at start time so
 * the values are stable across the gateway's runtime.
 */
export interface StdioRuntimeEnv {
    /** Initial backoff before retrying a crashed/failed spawn. */
    restartBackoffMs: number
    /** Cap on the exponential backoff between respawn attempts. */
    restartBackoffMaxMs: number
    /** Log level (`info` or `debug`) for child stderr lines. */
    stderrLogLevel: 'info' | 'debug'
    /** Upper bound on how long shutdown blocks waiting for graceful exit. */
    shutdownGraceMs: number
}

/** Reads the four stdio env vars with defaults. Safe to call repeatedly. */
export const readStdioRuntimeEnv = (): StdioRuntimeEnv => {
    const restartBackoffMs = parseIntEnv(process.env.MCP_STDIO_RESTART_BACKOFF_MS, DEFAULT_RESTART_BACKOFF_MS)
    const restartBackoffMaxMs = parseIntEnv(process.env.MCP_STDIO_RESTART_BACKOFF_MAX_MS, DEFAULT_RESTART_BACKOFF_MAX_MS)
    const shutdownGraceMs = parseIntEnv(process.env.MCP_STDIO_SHUTDOWN_GRACE_MS, DEFAULT_SHUTDOWN_GRACE_MS)
    const rawLevel = (process.env.MCP_STDIO_STDERR_LOG_LEVEL ?? 'info').toLowerCase()
    const stderrLogLevel: 'info' | 'debug' = rawLevel === 'debug' ? 'debug' : 'info'
    return { restartBackoffMs, restartBackoffMaxMs, stderrLogLevel, shutdownGraceMs }
}

const parseIntEnv = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Synchronous parse of an `MCPServer` row's persisted stdio config. Validates
 * shape only; does not touch the credential vault. Returns the raw argv
 * strings (interpolation tokens unresolved) and env entries (credential refs
 * unresolved). Throws `InternalChronosError(400)` on malformed JSON or
 * missing `command`.
 */
export interface ParsedStdioConfig {
    command: string
    argTokens: string[]
    envEntries: Array<{ key: string; value: StdioEnvValue }>
}

export const parseStdioConfig = (server: MCPServer): ParsedStdioConfig => {
    if (!server.command || server.command.trim().length === 0) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `MCP server "${server.slug}" stdio config has no command`)
    }

    let argTokens: string[] = []
    if (server.args) {
        let parsedArgs: unknown
        try {
            parsedArgs = JSON.parse(server.args)
        } catch (error) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `MCP server "${server.slug}" args is not valid JSON: ${getErrorMessage(error)}`
            )
        }
        if (!Array.isArray(parsedArgs)) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `MCP server "${server.slug}" args must be a JSON array of strings`)
        }
        for (const arg of parsedArgs) {
            if (typeof arg !== 'string') {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, `MCP server "${server.slug}" args contains a non-string element`)
            }
        }
        argTokens = parsedArgs
    }

    const envEntries: Array<{ key: string; value: StdioEnvValue }> = []
    if (server.env) {
        let parsedEnv: unknown
        try {
            parsedEnv = JSON.parse(server.env)
        } catch (error) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `MCP server "${server.slug}" env is not valid JSON: ${getErrorMessage(error)}`
            )
        }
        if (!parsedEnv || typeof parsedEnv !== 'object' || Array.isArray(parsedEnv)) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `MCP server "${server.slug}" env must be a JSON object`)
        }
        for (const [key, value] of Object.entries(parsedEnv as Record<string, unknown>)) {
            if (typeof value === 'string') {
                envEntries.push({ key, value })
                continue
            }
            if (isCredentialRef(value)) {
                envEntries.push({ key, value })
                continue
            }
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `MCP server "${server.slug}" env value for "${key}" must be a string or a {credentialId, field} reference`
            )
        }
    }

    return { command: server.command, argTokens, envEntries }
}

const isCredentialRef = (value: unknown): value is StdioCredentialRef => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const ref = value as Record<string, unknown>
    return typeof ref.credentialId === 'string' && typeof ref.field === 'string'
}

/** Spawn-time strings with all credential refs resolved. */
export interface ResolvedStdioConfig {
    command: string
    args: string[]
    env: Record<string, string>
}

/**
 * Resolves a parsed stdio config by decrypting any credential references in
 * `env` and substituting any `{{credentialId:field}}` tokens in `args`.
 * Decryption happens against `Credential` rows in the running app's data
 * source via `decryptCredentialData`. The returned `command`/`args`/`env`
 * are the exact arguments handed to the SDK transport — no plaintext
 * secrets are ever written back to `MCPServer`.
 *
 * `deps.fetchCredential` is a test seam; production callers omit it and the
 * helper resolves against the live `Credential` repository.
 */
export interface ResolveStdioDeps {
    fetchCredential?: (credentialId: string) => Promise<Record<string, unknown>>
}

export const resolveStdioConfig = async (parsed: ParsedStdioConfig, deps: ResolveStdioDeps = {}): Promise<ResolvedStdioConfig> => {
    const fetchCredential = deps.fetchCredential ?? defaultFetchCredential

    // Cache decrypted credentials within one resolution so the same vault
    // entry is decrypted once even if referenced from both args and env.
    const credentialCache = new Map<string, Record<string, unknown>>()
    const getCredential = async (credentialId: string): Promise<Record<string, unknown>> => {
        const cached = credentialCache.get(credentialId)
        if (cached) return cached
        const decrypted = await fetchCredential(credentialId)
        credentialCache.set(credentialId, decrypted)
        return decrypted
    }

    const args: string[] = []
    for (const token of parsed.argTokens) {
        args.push(await interpolateArgToken(token, getCredential))
    }

    const env: Record<string, string> = {}
    for (const { key, value } of parsed.envEntries) {
        if (typeof value === 'string') {
            env[key] = value
            continue
        }
        const decrypted = await getCredential(value.credentialId)
        const fieldValue = decrypted[value.field]
        if (typeof fieldValue !== 'string') {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `Credential ${value.credentialId} has no string field "${value.field}" for env var ${key}`
            )
        }
        env[key] = fieldValue
    }

    return { command: parsed.command, args, env }
}

const interpolateArgToken = async (
    token: string,
    getCredential: (credentialId: string) => Promise<Record<string, unknown>>
): Promise<string> => {
    if (!token.includes('{{')) return token
    // Run async substitution in a single pass: collect matches, decrypt in
    // order, then splice.
    const matches: Array<{ start: number; end: number; credentialId: string; field: string }> = []
    let m: RegExpExecArray | null
    ARG_INTERPOLATION_PATTERN.lastIndex = 0
    while ((m = ARG_INTERPOLATION_PATTERN.exec(token))) {
        matches.push({ start: m.index, end: m.index + m[0].length, credentialId: m[1], field: m[2] })
    }
    if (matches.length === 0) return token

    const parts: string[] = []
    let cursor = 0
    for (const match of matches) {
        parts.push(token.slice(cursor, match.start))
        const decrypted = await getCredential(match.credentialId)
        const fieldValue = decrypted[match.field]
        if (typeof fieldValue !== 'string') {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `Credential ${match.credentialId} has no string field "${match.field}" for argv interpolation`
            )
        }
        parts.push(fieldValue)
        cursor = match.end
    }
    parts.push(token.slice(cursor))
    return parts.join('')
}

const defaultFetchCredential = async (credentialId: string): Promise<Record<string, unknown>> => {
    const appServer = getRunningExpressApp()
    const credential = await appServer.AppDataSource.getRepository(Credential).findOneBy({ id: credentialId })
    if (!credential) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
    }
    const decrypted = await decryptCredentialData(credential.encryptedData)
    return decrypted as Record<string, unknown>
}

/**
 * Builds an `StdioClientTransport` ready for `client.connect()`. Pipes the
 * child's stderr into the Chronos logger with `[stdio:<slug>]` prefix at the
 * configured level. The transport's spawn happens during `client.connect()`
 * — this function only constructs the object.
 *
 * `cwd` inherits `process.cwd()` per locked decision #25. Env is the
 * resolved object merged with the SDK's default-inherited PATH/etc. (the
 * SDK passes our `env` straight to spawn, so any inheritance happens on the
 * caller side — we merge `process.env` ourselves for clarity).
 */
export const buildStdioTransport = (resolved: ResolvedStdioConfig, slug: string, runtimeEnv: StdioRuntimeEnv): StdioClientTransport => {
    const params: StdioServerParameters = {
        command: resolved.command,
        args: resolved.args,
        env: { ...filterStringEnv(process.env), ...resolved.env },
        cwd: process.cwd(),
        stderr: 'pipe'
    }
    const transport = new StdioClientTransport(params)

    // The SDK exposes `stderr` immediately as a PassThrough — safe to attach
    // listeners before `transport.start()` is called inside client.connect().
    const stderrStream = transport.stderr
    if (stderrStream) {
        const level = runtimeEnv.stderrLogLevel
        let buffer = ''
        stderrStream.on('data', (chunk: Buffer | string) => {
            buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
            let newlineIdx = buffer.indexOf('\n')
            while (newlineIdx !== -1) {
                const line = buffer.slice(0, newlineIdx).trimEnd()
                buffer = buffer.slice(newlineIdx + 1)
                if (line.length > 0) emitStderrLine(slug, level, line)
                newlineIdx = buffer.indexOf('\n')
            }
        })
        stderrStream.on('end', () => {
            if (buffer.trim().length > 0) emitStderrLine(slug, level, buffer.trim())
            buffer = ''
        })
    }

    return transport
}

const filterStringEnv = (env: NodeJS.ProcessEnv): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(env)) {
        if (typeof v === 'string') out[k] = v
    }
    return out
}

const emitStderrLine = (slug: string, level: 'info' | 'debug', line: string): void => {
    const message = `[stdio:${slug}] ${line}`
    if (level === 'debug') {
        logger.debug(message)
    } else {
        logger.info(message)
    }
}

/**
 * Best-effort upper bound on `StdioClientTransport.close()`. The SDK runs
 * stdin.end → SIGTERM → SIGKILL internally with its own 2s waits between
 * stages (~4s total). This helper races the close against
 * `MCP_STDIO_SHUTDOWN_GRACE_MS` and returns once whichever comes first —
 * the SDK's SIGKILL will still fire asynchronously past our return.
 */
export const closeStdioTransportWithGrace = async (
    transport: StdioClientTransport,
    slug: string,
    runtimeEnv: StdioRuntimeEnv
): Promise<void> => {
    const closePromise = transport.close().catch((error) => {
        logger.warn(`[stdio:${slug}] close error: ${getErrorMessage(error)}`)
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            logger.warn(`[stdio:${slug}] close exceeded ${runtimeEnv.shutdownGraceMs}ms grace; returning while SDK continues SIGKILL`)
            resolve()
        }, runtimeEnv.shutdownGraceMs)
    })
    try {
        await Promise.race([closePromise, timeoutPromise])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * Per-server consecutive-spawn-failure tracker. Each entry counts how many
 * spawn attempts have failed in a row and stamps the earliest time a new
 * attempt is allowed. `recordSuccess` resets the counter; `recordFailure`
 * increments and computes the next backoff window with
 * `min(restartBackoffMs * 2^attempts, restartBackoffMaxMs)`.
 */
interface BackoffEntry {
    consecutiveFailures: number
    nextAllowedAt: number
}

export class StdioBackoffState {
    private map: Map<string, BackoffEntry> = new Map()

    /**
     * True when the caller may attempt a spawn now. When false, `retryInMs`
     * is the wait until the next attempt is allowed.
     */
    public allowedNow(serverId: string, now: number = Date.now()): { allowed: boolean; retryInMs: number } {
        const entry = this.map.get(serverId)
        if (!entry || entry.nextAllowedAt <= now) {
            return { allowed: true, retryInMs: 0 }
        }
        return { allowed: false, retryInMs: entry.nextAllowedAt - now }
    }

    public recordSuccess(serverId: string): void {
        this.map.delete(serverId)
    }

    public recordFailure(serverId: string, runtimeEnv: StdioRuntimeEnv, now: number = Date.now()): BackoffEntry {
        const entry = this.map.get(serverId) ?? { consecutiveFailures: 0, nextAllowedAt: 0 }
        const nextFailures = entry.consecutiveFailures + 1
        const delay = Math.min(runtimeEnv.restartBackoffMs * 2 ** (nextFailures - 1), runtimeEnv.restartBackoffMaxMs)
        const updated: BackoffEntry = { consecutiveFailures: nextFailures, nextAllowedAt: now + delay }
        this.map.set(serverId, updated)
        return updated
    }

    public failureCount(serverId: string): number {
        return this.map.get(serverId)?.consecutiveFailures ?? 0
    }

    /** Test seam — clear all backoff state. */
    public reset(): void {
        this.map.clear()
    }
}

/**
 * Convenience composite — parse, resolve, and build a transport in one call
 * for the gateway's `getOrOpen` path. Failures throw upward so the caller's
 * try/catch can record a backoff increment and convert to the right HTTP
 * status code.
 */
export const buildStdioTransportForServer = async (
    server: MCPServer,
    runtimeEnv: StdioRuntimeEnv,
    deps: ResolveStdioDeps = {}
): Promise<StdioClientTransport> => {
    const parsed = parseStdioConfig(server)
    const resolved = await resolveStdioConfig(parsed, deps)
    return buildStdioTransport(resolved, server.slug, runtimeEnv)
}
