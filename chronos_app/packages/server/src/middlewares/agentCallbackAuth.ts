import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { Agent } from '../database/entities/Agent'
import { AgentRuntimeType } from '../Interface'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import { getErrorMessage } from '../errors/utils'
import logger from '../utils/logger'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

declare global {
    namespace Express {
        interface Request {
            callbackAgent?: Agent
        }
    }
}

const respond = (res: Response, status: number, error: string): Response => {
    return res.status(status).json({ success: false, error })
}

/**
 * Authenticates a registered HTTP agent calling the MCP gateway. The agent
 * presents its `callbackToken` as a Bearer credential; the middleware
 * constant-time-compares it against the value stored on the `Agent` row
 * keyed by `:agentId`. On success, attaches `req.callbackAgent`.
 *
 * Rejects:
 * - 401 if Authorization header is missing or malformed
 * - 401 if the supplied token does not match the stored token (also 401 for
 *   "agent not found" to avoid leaking which IDs exist)
 * - 403 if the agent is BUILT_IN (callbacks are HTTP-only) or disabled
 *
 * Mounted on `POST /api/v1/agent-callbacks/:agentId/tools/invoke` and
 * `GET /api/v1/agent-callbacks/:agentId/tools`. Path is whitelisted in
 * `utils/constants.ts` so external agents bypass the global API-key auth —
 * the callback token IS the auth.
 */
export const agentCallbackAuth = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return respond(res, 401, 'Missing or invalid Authorization header')
        }
        const supplied = authHeader.substring(7).trim()
        if (!supplied) {
            return respond(res, 401, 'Missing or invalid Authorization header')
        }

        const agentId = req.params.agentId
        if (!agentId) {
            return respond(res, 400, 'agentId path parameter is required')
        }

        // Skip the DB lookup if `agentId` isn't a UUID — Postgres rejects
        // non-UUID strings on the uuid column and would 500 with a stack
        // trace, which leaks that the input shape failed parsing. We still
        // run the constant-time compare against an empty stored token so
        // timing on this path matches the "valid UUID, agent missing" path.
        const appServer = getRunningExpressApp()
        const agent = UUID_RE.test(agentId) ? await appServer.AppDataSource.getRepository(Agent).findOneBy({ id: agentId }) : null

        // Constant-time-compare even when the agent does not exist so token
        // verification cost does not leak the existence of an agent ID.
        const storedToken = agent?.callbackToken ?? ''
        if (!safeEqual(storedToken, supplied) || !agent) {
            return respond(res, 401, 'Invalid callback token')
        }

        if (agent.runtimeType !== AgentRuntimeType.HTTP) {
            return respond(res, 403, 'Callbacks are only available for HTTP agents')
        }
        if (!agent.enabled) {
            return respond(res, 403, 'Agent is disabled')
        }

        req.callbackAgent = agent
        return next()
    } catch (error) {
        logger.error(`[agentCallbackAuth] Unexpected error: ${getErrorMessage(error)}`)
        return respond(res, 500, 'Internal authentication error')
    }
}

/**
 * `timingSafeEqual` requires equal-length buffers; pad to a fixed length first
 * so the comparison itself does not branch on input length, then return false
 * if the original lengths differed.
 */
const safeEqual = (a: string, b: string): boolean => {
    const len = Math.max(a.length, b.length, 1)
    const ab = Buffer.alloc(len)
    const bb = Buffer.alloc(len)
    ab.write(a)
    bb.write(b)
    return timingSafeEqual(ab, bb) && a.length === b.length
}
