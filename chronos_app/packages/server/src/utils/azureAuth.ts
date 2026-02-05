import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import logger from './logger'

/**
 * Azure PostgreSQL resource scope for token acquisition.
 * This is the standard scope for Azure Database for PostgreSQL AAD authentication.
 */
const POSTGRES_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

/**
 * Gets an Azure AD access token for PostgreSQL authentication.
 * Used when DATABASE_AUTH_TYPE=azure-managed-identity.
 *
 * @param clientId - Optional client ID for user-assigned managed identity.
 *                   If omitted, uses system-assigned identity or DefaultAzureCredential chain.
 * @returns Promise resolving to the access token string
 * @throws Error if token acquisition fails
 */
export async function getAzurePostgresToken(clientId?: string): Promise<string> {
    let credential

    if (clientId) {
        // User-assigned managed identity - use specific client ID
        credential = new ManagedIdentityCredential(clientId)
        logger.debug(`Using user-assigned managed identity: ${clientId}`)
    } else {
        // System-assigned managed identity or auto-detect credential chain
        // DefaultAzureCredential tries: environment vars, managed identity, Azure CLI, etc.
        credential = new DefaultAzureCredential()
        logger.debug('Using DefaultAzureCredential (system-assigned MI or Azure CLI)')
    }

    const tokenResponse = await credential.getToken(POSTGRES_SCOPE)

    if (!tokenResponse?.token) {
        throw new Error('Failed to acquire Azure AD token for PostgreSQL')
    }

    logger.debug('Successfully acquired Azure AD token for PostgreSQL')
    return tokenResponse.token
}

/**
 * Creates a password callback function for the pg driver.
 * This function is called each time a new database connection is created,
 * ensuring tokens are refreshed automatically before expiration.
 *
 * @param clientId - Optional client ID for user-assigned managed identity
 * @returns Async function that returns the current access token
 */
export function createAzurePasswordCallback(clientId?: string): () => Promise<string> {
    return async () => {
        return getAzurePostgresToken(clientId)
    }
}
