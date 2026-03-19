import { isValidUUID } from 'chronos-components'
import agentflowsService from '../services/agentflows'
import logger from './logger'

/**
 * Validates if the origin is allowed for a specific agentflow
 * @param agentflowId - The agentflow ID to validate against
 * @param origin - The origin URL to validate
 * @returns Promise<boolean> - True if domain is allowed, false otherwise
 */
async function validateAgentflowDomain(agentflowId: string, origin: string): Promise<boolean> {
    try {
        if (!agentflowId || !isValidUUID(agentflowId)) {
            throw new Error('Invalid agentflowId format - must be a valid UUID')
        }

        const agentflow = await agentflowsService.getAgentflowById(agentflowId)

        if (!agentflow?.chatbotConfig) {
            return true
        }

        const config = JSON.parse(agentflow.chatbotConfig)

        // If no allowed origins configured or first entry is empty, allow all
        if (!config.allowedOrigins?.length || config.allowedOrigins[0] === '') {
            return true
        }

        const originHost = new URL(origin).host
        const isAllowed = config.allowedOrigins.some((domain: string) => {
            try {
                const allowedOrigin = new URL(domain).host
                return originHost === allowedOrigin
            } catch (error) {
                logger.warn(`Invalid domain format in allowedOrigins: ${domain}`)
                return false
            }
        })

        return isAllowed
    } catch (error) {
        logger.error(`Error validating domain for agentflow ${agentflowId}:`, error)
        return false
    }
}

// NOTE: This function extracts the agentflow ID from a prediction URL.
// It assumes the URL format is /prediction/{agentflowId}.
/**
 * Extracts agentflow ID from prediction URL
 * @param url - The request URL
 * @returns string | null - The agentflow ID or null if not found
 */
function extractAgentflowId(url: string): string | null {
    try {
        const urlParts = url.split('/')
        const predictionIndex = urlParts.indexOf('prediction')

        if (predictionIndex !== -1 && urlParts.length > predictionIndex + 1) {
            const agentflowId = urlParts[predictionIndex + 1]
            // Remove query parameters if present
            return agentflowId.split('?')[0]
        }

        return null
    } catch (error) {
        logger.error('Error extracting agentflow ID from URL:', error)
        return null
    }
}

/**
 * Validates if a request is a prediction request
 * @param url - The request URL
 * @returns boolean - True if it's a prediction request
 */
function isPredictionRequest(url: string): boolean {
    return url.includes('/prediction/')
}

/**
 * Get the custom error message for unauthorized origin
 * @param agentflowId - The agentflow ID
 * @returns Promise<string> - Custom error message or default
 */
async function getUnauthorizedOriginError(agentflowId: string): Promise<string> {
    try {
        const agentflow = await agentflowsService.getAgentflowById(agentflowId)

        if (agentflow?.chatbotConfig) {
            const config = JSON.parse(agentflow.chatbotConfig)
            return config.allowedOriginsError || 'This site is not allowed to access this chatbot'
        }

        return 'This site is not allowed to access this chatbot'
    } catch (error) {
        logger.error(`Error getting unauthorized origin error for agentflow ${agentflowId}:`, error)
        return 'This site is not allowed to access this chatbot'
    }
}

export { isPredictionRequest, extractAgentflowId, validateAgentflowDomain, getUnauthorizedOriginError }
