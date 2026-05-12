import { DataSource } from 'typeorm'
import { Credential } from '../database/entities/Credential'
import { ensureFreshAccessToken } from '../services/credentials/oauth2-refresh'
import { decryptCredentialData } from '../utils'
import { getErrorMessage } from '../errors/utils'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('OAuth2RefreshScheduler')

const DEFAULT_POLL_INTERVAL_MS = 60_000
const DEFAULT_REFRESH_LEAD_MS = 300_000
const CONCURRENCY_CAP = 10
const OAUTH2_REFRESH_CREDENTIAL_NAME = 'oauth2-refresh'

interface OAuth2RefreshSchedulerOptions {
    appDataSource: DataSource
}

/**
 * Periodically refreshes `oauth2-refresh` credentials that are close to
 * expiry, so the access-token rotation does not happen in the hot path of
 * a tool call. Reactive (on-demand) refresh through `ensureFreshAccessToken`
 * is the primary safety net — this scheduler is an optimization that keeps
 * tokens fresh during quiet periods.
 *
 * Behaviour:
 * - Every `MCP_OAUTH2_REFRESH_INTERVAL_MS` (default 60s) the scheduler reads
 *   every credential of type `oauth2-refresh`, decrypts each, and inspects
 *   the encoded `expiresAt`.
 * - Credentials with `expiresAt - now() < MCP_OAUTH2_REFRESH_LEAD_MS`
 *   (default 5min) are passed to `ensureFreshAccessToken`, which owns the
 *   actual refresh + atomic re-encrypt + audit emit + UNHEALTHY-marking on
 *   `invalid_grant`. Concurrency capped at 10 to bound load on slow providers.
 * - A credential that fails to decrypt or whose payload is missing required
 *   fields is logged and skipped — the background scheduler never escalates
 *   to UNHEALTHY-marking; that path is reserved for the invoke-time resolver
 *   so the action is tied to a real call attempt.
 *
 * Gated externally on `ENABLE_MCP_OAUTH2_REFRESH=true` so existing deployments
 * keep the legacy "manual refresh on 401" behaviour until the operator
 * opts in.
 *
 * Worker-mode caveat (single-instance MVP — Redis-backed shared state is a
 * future patch): each instance polls and refreshes independently. The
 * in-process single-flight mutex in `ensureFreshAccessToken` dedupes
 * concurrent refreshes within one process; across instances duplicate
 * refreshes are accepted as a known limitation of the single-instance v1.8.0
 * shape. Operators running multi-instance deployments should either pin
 * sticky routing on this scheduler or accept the occasional duplicate POST.
 */
export class OAuth2RefreshScheduler {
    private appDataSource: DataSource
    private intervalId: ReturnType<typeof setInterval> | null = null
    private running = false

    constructor(options: OAuth2RefreshSchedulerOptions) {
        this.appDataSource = options.appDataSource
    }

    public start(): void {
        if (this.intervalId) return

        const pollIntervalMs = readEnvInt('MCP_OAUTH2_REFRESH_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS)

        logger.info(`Starting with ${pollIntervalMs}ms poll interval`)

        this.intervalId = setInterval(() => {
            this.poll()
        }, pollIntervalMs)

        this.poll()
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            logger.info('Stopped')
        }
    }

    /** Test seam — exposes the running flag for non-overlapping-poll assertions. */
    public isRunning(): boolean {
        return this.running
    }

    private async poll(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const leadMs = readEnvInt('MCP_OAUTH2_REFRESH_LEAD_MS', DEFAULT_REFRESH_LEAD_MS)
            const now = Date.now()

            const repo = this.appDataSource.getRepository(Credential)
            const candidates = await repo.find({ where: { credentialName: OAUTH2_REFRESH_CREDENTIAL_NAME } })

            const stale: string[] = []
            for (const credential of candidates) {
                if (await this.isStale(credential, now, leadMs)) {
                    stale.push(credential.id)
                }
            }

            for (let i = 0; i < stale.length; i += CONCURRENCY_CAP) {
                const batch = stale.slice(i, i + CONCURRENCY_CAP)
                await Promise.allSettled(batch.map((credentialId) => this.refreshOne(credentialId)))
            }
        } catch (error) {
            logger.error('Poll failed:', { error })
        } finally {
            this.running = false
        }
    }

    private async isStale(credential: Credential, nowMs: number, leadMs: number): Promise<boolean> {
        try {
            const decrypted = await decryptCredentialData(credential.encryptedData)
            const expiresAt = decrypted?.expiresAt
            if (typeof expiresAt !== 'string') {
                logger.warn(`Credential ${credential.id} payload has no string expiresAt; skipping`)
                return false
            }
            const expiresAtMs = Date.parse(expiresAt)
            if (!Number.isFinite(expiresAtMs)) {
                logger.warn(`Credential ${credential.id} has unparseable expiresAt "${expiresAt}"; skipping`)
                return false
            }
            return expiresAtMs - nowMs < leadMs
        } catch (error) {
            logger.warn(`Decrypt peek failed for credential ${credential.id}: ${getErrorMessage(error)}`)
            return false
        }
    }

    private async refreshOne(credentialId: string): Promise<void> {
        try {
            await ensureFreshAccessToken({ credentialId })
        } catch (error) {
            // ensureFreshAccessToken already emits its own audit row and marks
            // dependent MCP servers UNHEALTHY on invalid_grant. The background
            // scheduler only logs at warn level so a flapping provider does
            // not flood ERROR-level logs.
            logger.warn(`Refresh failed for credential ${credentialId}: ${getErrorMessage(error)}`)
        }
    }
}

const readEnvInt = (name: string, fallback: number): number => {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
