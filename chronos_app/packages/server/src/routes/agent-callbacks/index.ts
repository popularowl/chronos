import express from 'express'
import agentCallbacksController from '../../controllers/agent-callbacks'
import { agentCallbackAuth } from '../../middlewares/agentCallbackAuth'

const router = express.Router()

/**
 * MCP gateway callback surface. The agent's `callbackToken` is the auth — no
 * API key, no JWT. The path is whitelisted in `utils/constants.ts` so the
 * global API-key check skips it; `agentCallbackAuth` enforces the bearer.
 */
router.post('/:agentId/tools/invoke', agentCallbackAuth, agentCallbacksController.invokeTool)
router.get('/:agentId/tools', agentCallbackAuth, agentCallbacksController.listTools)

export default router
