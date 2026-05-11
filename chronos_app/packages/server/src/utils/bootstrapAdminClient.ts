/**
 * Bootstrap an admin OAuth client from environment variables on first startup.
 * Solves the chicken-and-egg problem: management keys can only be created via
 * the admin API, but the admin API requires a management key.
 *
 * Set ADMIN_CLIENT_ID, ADMIN_CLIENT_SECRET, and optionally ADMIN_CLIENT_SCOPES
 * to create the first OAuth client automatically.
 */

import logger from './logger'
import oauthClientService from '../services/oauth-client'

/**
 * Create a bootstrap admin OAuth client if env vars are set and client doesn't exist yet.
 */
export const bootstrapAdminOAuthClient = async (): Promise<void> => {
    const clientId = process.env.ADMIN_CLIENT_ID
    const clientSecret = process.env.ADMIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        return
    }

    const scopesEnv = process.env.ADMIN_CLIENT_SCOPES || 'admin:full'
    const scopes = scopesEnv.split(',').map((s) => s.trim())

    try {
        const client = await oauthClientService.createBootstrapClient(clientId, clientSecret, scopes)
        if (client) {
            logger.info(`[server]: Admin OAuth client [${clientId}] is ready`)
        }
    } catch (error) {
        logger.error(`❌ [server]: Failed to bootstrap admin OAuth client: ${error}`)
    }
}
