/**
 * Initialize the first user from environment variables.
 * This runs once on first container startup when no users exist.
 */

import { getDataSource } from '../DataSource'
import { User } from '../database/entities/User'
import { AuthService } from '../services/auth'
import logger from './logger'

/**
 * Configuration for initial user from environment variables
 */
interface InitialUserConfig {
    email: string
    password: string
    name?: string
}

/**
 * Parse CHRONOS_INITIAL_USER environment variable.
 * Format: email:password or email:password:name
 * Password can contain colons - parsing uses first colon for email, last colon for name.
 * @returns Configuration object or null if not configured or invalid
 */
function getInitialUserConfig(): InitialUserConfig | null {
    const initialUser = process.env.CHRONOS_INITIAL_USER

    if (!initialUser) {
        return null
    }

    const firstColonIndex = initialUser.indexOf(':')
    if (firstColonIndex === -1) {
        logger.error('❌ [server]: Invalid CHRONOS_INITIAL_USER format. Expected email:password or email:password:name')
        return null
    }

    const email = initialUser.substring(0, firstColonIndex)
    const remainder = initialUser.substring(firstColonIndex + 1)

    const lastColonIndex = remainder.lastIndexOf(':')

    let password: string
    let name: string | undefined

    if (lastColonIndex === -1) {
        // Format: email:password (no name)
        password = remainder
    } else {
        // Format: email:password:name (password may contain colons)
        password = remainder.substring(0, lastColonIndex)
        name = remainder.substring(lastColonIndex + 1)
    }

    if (!email || !password) {
        logger.error('❌ [server]: Invalid CHRONOS_INITIAL_USER format. Email and password are required.')
        return null
    }

    return { email, password, name }
}

/**
 * Check if any users exist in the database.
 * @returns true if users exist, false if user table is empty
 */
async function hasExistingUsers(): Promise<boolean> {
    const userRepo = getDataSource().getRepository(User)
    const count = await userRepo.count()
    return count > 0
}

/**
 * Initialize the initial user from environment variables.
 *
 * This function:
 * 1. Checks if CHRONOS_INITIAL_USER is set (format: email:password:name)
 * 2. Checks if the user table is empty (first run)
 * 3. Creates the initial user if both conditions are met
 *
 * This ensures idempotent behavior - the user is only created once,
 * on the first container startup.
 */
export async function initializeInitialUser(): Promise<void> {
    const config = getInitialUserConfig()

    // If env vars not set, skip silently
    if (!config) {
        logger.debug('👤 [server]: No initial user configuration provided (CHRONOS_INITIAL_USER not set)')
        return
    }

    // Check if users already exist
    const usersExist = await hasExistingUsers()
    if (usersExist) {
        logger.info('👤 [server]: Users already exist in database, skipping initial user creation')
        return
    }

    // Validate password
    if (config.password.length < 8) {
        logger.error('❌ [server]: Initial user password must be at least 8 characters. Skipping user creation.')
        return
    }

    // Create the initial user (will automatically get admin role as the first user)
    try {
        const authService = new AuthService()
        await authService.signup({
            email: config.email,
            password: config.password,
            name: config.name
        })

        logger.info(`✅ [server]: Initial admin user created successfully: ${config.email}`)
    } catch (error) {
        logger.error(`❌ [server]: Failed to create initial user: ${error}`)
    }
}
