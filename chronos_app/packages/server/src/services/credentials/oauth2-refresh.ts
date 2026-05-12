import { StatusCodes } from 'http-status-codes'
import { Credential } from '../../database/entities/Credential'
import { MCPServer } from '../../database/entities/MCPServer'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { CREDENTIAL_ACCESS_SOURCE_OAUTH2_REFRESH, MCPServerStatus, OAuth2RefreshPayload } from '../../Interface'
import auditService from '../audit'
import { decryptCredentialData, encryptCredentialData } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createModuleLogger } from '../../utils/logger'

const logger = createModuleLogger('OAuth2Refresh')

/** Skew applied to `expiresAt`. A token within `EXPIRY_SKEW_MS` of now is treated as already expired. */
const EXPIRY_SKEW_MS = 30_000

/** Max attempts for a transient refresh failure (network / 5xx). `invalid_grant` does NOT retry. */
const REFRESH_MAX_ATTEMPTS = 3

/** Initial backoff before the first retry; doubles each attempt. */
const REFRESH_BASE_DELAY_MS = 500

/**
 * Single-flight map keyed by credentialId. Concurrent calls that all observe
 * an expired token share one refresh Promise so the provider sees one POST,
 * not N. Cleared once the refresh settles (success or failure).
 */
const inflightRefreshes: Map<string, Promise<string>> = new Map()

interface OAuth2RefreshOptions {
    credentialId: string
    auditContext?: {
        userId?: string | null
        agentId?: string | null
        requestPath?: string | null
    }
}

interface OAuth2RefreshDeps {
    /** Override for tests — defaults to global fetch. */
    fetchImpl?: typeof fetch
    /** Override for tests — defaults to Date.now. */
    now?: () => number
    /** Override for tests — defaults to setTimeout-backed sleep. */
    sleep?: (ms: number) => Promise<void>
}

/**
 * Returns a fresh access token for an `oauth2-refresh` credential. Caller
 * should treat the return as ephemeral — fetch on every use, never cache
 * across `resolveOutboundAuth` calls. The function:
 *
 * 1. Loads + decrypts the credential.
 * 2. If `expiresAt - now() > 30s`, returns the cached access token unchanged.
 * 3. Otherwise refreshes via RFC 6749 § 6 (`grant_type=refresh_token`) with
 *    retry on transient failure, re-encrypts the credential with the new
 *    `accessToken` + `expiresAt` (and `refreshToken` if the provider rotated),
 *    and returns the new access token.
 * 4. On unrecoverable failure (`invalid_grant`, malformed stored payload,
 *    decryption failure), marks every `MCPServer` referencing this credential
 *    as `UNHEALTHY` and throws `InternalChronosError(503)`.
 * 5. Writes one `credential_access_audit` row per attempt (success + failure),
 *    fire-and-forget.
 */
export const ensureFreshAccessToken = async (options: OAuth2RefreshOptions, deps: OAuth2RefreshDeps = {}): Promise<string> => {
    const { credentialId } = options
    const inflight = inflightRefreshes.get(credentialId)
    if (inflight) return inflight

    const promise = doEnsureFreshAccessToken(options, deps)
    inflightRefreshes.set(credentialId, promise)
    try {
        return await promise
    } finally {
        inflightRefreshes.delete(credentialId)
    }
}

const doEnsureFreshAccessToken = async (options: OAuth2RefreshOptions, deps: OAuth2RefreshDeps): Promise<string> => {
    const { credentialId, auditContext } = options
    const now = deps.now ?? Date.now

    const appServer = getRunningExpressApp()
    const repo = appServer.AppDataSource.getRepository(Credential)
    const credential = await repo.findOneBy({ id: credentialId })
    if (!credential) {
        await emitAudit(credentialId, auditContext, false, 'Credential not found')
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
    }

    let payload: OAuth2RefreshPayload
    try {
        const decrypted = await decryptCredentialData(credential.encryptedData)
        payload = parsePayload(decrypted)
    } catch (error) {
        await emitAudit(credentialId, auditContext, false, `Decrypt failed: ${getErrorMessage(error)}`)
        await markServersUnhealthy(credentialId, 'OAuth2 credential payload is unreadable')
        throw new InternalChronosError(
            StatusCodes.SERVICE_UNAVAILABLE,
            `OAuth2 credential ${credentialId} payload is unreadable — re-paste required`
        )
    }

    const expiresAtMs = Date.parse(payload.expiresAt)
    const isFresh = Number.isFinite(expiresAtMs) && expiresAtMs - now() > EXPIRY_SKEW_MS
    if (isFresh) {
        await emitAudit(credentialId, auditContext, true, null)
        return payload.accessToken
    }

    const refreshed = await refreshWithRetry(payload, credentialId, auditContext, deps)
    const updated: OAuth2RefreshPayload = {
        ...payload,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        refreshToken: refreshed.refreshToken ?? payload.refreshToken,
        tokenType: refreshed.tokenType ?? payload.tokenType,
        scope: refreshed.scope ?? payload.scope
    }
    credential.encryptedData = await encryptCredentialData(updated as unknown as Record<string, unknown>)
    await repo.save(credential)

    return refreshed.accessToken
}

const parsePayload = (decrypted: Record<string, unknown>): OAuth2RefreshPayload => {
    if (!decrypted || typeof decrypted !== 'object') {
        throw new Error('Decrypted payload is not an object')
    }
    if (decrypted.type !== 'oauth2-refresh') {
        throw new Error(`Decrypted payload type is "${decrypted.type}", expected "oauth2-refresh"`)
    }
    const required: (keyof OAuth2RefreshPayload)[] = [
        'tokenEndpoint',
        'clientId',
        'clientSecret',
        'refreshToken',
        'accessToken',
        'expiresAt'
    ]
    for (const field of required) {
        if (typeof decrypted[field] !== 'string' || !decrypted[field]) {
            throw new Error(`Decrypted payload missing required field "${field}"`)
        }
    }
    return decrypted as unknown as OAuth2RefreshPayload
}

interface RefreshResult {
    accessToken: string
    expiresAt: string
    refreshToken?: string
    tokenType?: string
    scope?: string
}

const refreshWithRetry = async (
    payload: OAuth2RefreshPayload,
    credentialId: string,
    auditContext: OAuth2RefreshOptions['auditContext'],
    deps: OAuth2RefreshDeps
): Promise<RefreshResult> => {
    const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as typeof fetch)
    const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
    const now = deps.now ?? Date.now

    let lastError: Error | null = null
    for (let attempt = 1; attempt <= REFRESH_MAX_ATTEMPTS; attempt++) {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: payload.refreshToken,
                client_id: payload.clientId,
                client_secret: payload.clientSecret
            })
            const response = await fetchImpl(payload.tokenEndpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
                body: body.toString()
            })

            if (response.status === 400 || response.status === 401) {
                const text = await safeReadText(response)
                lastError = new Error(`Provider rejected refresh token (HTTP ${response.status}): ${text}`)
                await emitAudit(credentialId, auditContext, false, lastError.message)
                await markServersUnhealthy(credentialId, 'OAuth2 refresh token rejected — re-authorize required')
                throw new InternalChronosError(
                    StatusCodes.SERVICE_UNAVAILABLE,
                    `OAuth2 refresh token for credential ${credentialId} rejected — re-authorize required`
                )
            }

            if (!response.ok) {
                lastError = new Error(`Token endpoint returned HTTP ${response.status}`)
                await emitAudit(credentialId, auditContext, false, lastError.message)
            } else {
                const parsed = (await response.json()) as Record<string, unknown>
                const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : null
                if (!accessToken) {
                    lastError = new Error('Token endpoint response missing access_token')
                    await emitAudit(credentialId, auditContext, false, lastError.message)
                } else {
                    const expiresInSec = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600
                    const expiresAt = new Date(now() + expiresInSec * 1000).toISOString()
                    await emitAudit(credentialId, auditContext, true, null)
                    return {
                        accessToken,
                        expiresAt,
                        refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined,
                        tokenType: typeof parsed.token_type === 'string' ? parsed.token_type : undefined,
                        scope: typeof parsed.scope === 'string' ? parsed.scope : undefined
                    }
                }
            }
        } catch (error) {
            if (error instanceof InternalChronosError) throw error
            lastError = error instanceof Error ? error : new Error(getErrorMessage(error))
            await emitAudit(credentialId, auditContext, false, lastError.message)
        }

        if (attempt < REFRESH_MAX_ATTEMPTS) {
            const backoff = REFRESH_BASE_DELAY_MS * Math.pow(2, attempt - 1)
            logger.warn(
                `OAuth2 refresh attempt ${attempt}/${REFRESH_MAX_ATTEMPTS} for credential ${credentialId} failed; retrying in ${backoff}ms`
            )
            await sleep(backoff)
        }
    }

    throw new InternalChronosError(
        StatusCodes.SERVICE_UNAVAILABLE,
        `OAuth2 refresh for credential ${credentialId} exhausted ${REFRESH_MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown error'}`
    )
}

const safeReadText = async (response: Response): Promise<string> => {
    try {
        return await response.text()
    } catch {
        return ''
    }
}

const emitAudit = async (
    credentialId: string,
    auditContext: OAuth2RefreshOptions['auditContext'],
    success: boolean,
    errorMessage: string | null
): Promise<void> => {
    try {
        await auditService.recordCredentialAccess({
            credentialId,
            userId: auditContext?.userId ?? null,
            agentId: auditContext?.agentId ?? null,
            source: CREDENTIAL_ACCESS_SOURCE_OAUTH2_REFRESH,
            requestPath: auditContext?.requestPath ?? null,
            success,
            errorMessage
        })
    } catch (error) {
        logger.warn(`OAuth2 refresh audit emit failed for credential ${credentialId}: ${getErrorMessage(error)}`)
    }
}

const markServersUnhealthy = async (credentialId: string, errorMessage: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(MCPServer)
        const servers = await repo
            .createQueryBuilder('mcp_server')
            .where('mcp_server.outboundAuth LIKE :pattern', { pattern: `%${credentialId}%` })
            .getMany()
        for (const server of servers) {
            try {
                const parsed = JSON.parse(server.outboundAuth ?? '{}') as { type?: string; credentialId?: string }
                if (parsed.type !== 'oauth2-refresh' || parsed.credentialId !== credentialId) continue
                server.status = MCPServerStatus.UNHEALTHY
                server.lastHealthError = errorMessage
                server.lastHealthCheckAt = new Date()
                await repo.save(server)
            } catch (parseError) {
                logger.warn(`OAuth2 refresh: skipping server ${server.id} — outboundAuth parse failed: ${getErrorMessage(parseError)}`)
            }
        }
    } catch (error) {
        logger.warn(
            `OAuth2 refresh: failed to mark dependent MCP servers UNHEALTHY for credential ${credentialId}: ${getErrorMessage(error)}`
        )
    }
}

/** Test seam — clears the in-flight single-flight map. Used between test cases. */
export const __resetOAuth2RefreshInflight = (): void => {
    inflightRefreshes.clear()
}

export default { ensureFreshAccessToken }
