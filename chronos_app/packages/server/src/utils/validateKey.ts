import { Request } from 'express'
import { AgentFlow } from '../database/entities/AgentFlow'
import { ApiKey } from '../database/entities/ApiKey'
import { compareKeys } from './apiKey'
import apikeyService from '../services/apikey'

/**
 * Validate flow API Key, this is needed because Prediction/Upsert API is public
 * @param {Request} req
 * @param {AgentFlow} agentflow
 */
export const validateFlowAPIKey = async (req: Request, agentflow: AgentFlow): Promise<boolean> => {
    const agentFlowApiKeyId = agentflow?.apikeyid
    if (!agentFlowApiKeyId) return true

    const authorizationHeader = (req.headers['Authorization'] as string) ?? (req.headers['authorization'] as string) ?? ''
    if (agentFlowApiKeyId && !authorizationHeader) return false

    const suppliedKey = authorizationHeader.split(`Bearer `).pop()
    if (!suppliedKey) return false

    try {
        const apiKey = await apikeyService.getApiKeyById(agentFlowApiKeyId)
        if (!apiKey) return false

        const apiSecret = apiKey.apiSecret
        if (!apiSecret || !compareKeys(apiSecret, suppliedKey)) return false

        return true
    } catch (error) {
        return false
    }
}

/**
 * Validate and Get API Key Information
 * @param {Request} req
 * @returns {Promise<{isValid: boolean, apiKey?: ApiKey}>}
 */
export const validateAPIKey = async (req: Request): Promise<{ isValid: boolean; apiKey?: ApiKey }> => {
    const authorizationHeader = (req.headers['Authorization'] as string) ?? (req.headers['authorization'] as string) ?? ''
    if (!authorizationHeader) return { isValid: false }

    const suppliedKey = authorizationHeader.split(`Bearer `).pop()
    if (!suppliedKey) return { isValid: false }

    try {
        const apiKey = await apikeyService.getApiKey(suppliedKey)
        if (!apiKey) return { isValid: false }

        const apiSecret = apiKey.apiSecret
        if (!apiSecret || !compareKeys(apiSecret, suppliedKey)) {
            return { isValid: false, apiKey }
        }

        return { isValid: true, apiKey }
    } catch (error) {
        return { isValid: false }
    }
}
