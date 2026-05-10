import express from 'express'
import mcpGatewayController from '../../controllers/mcp-gateway'
import mcpGatewayMCPController from '../../controllers/mcp-gateway/mcp'
import { mcpGatewayAuth } from '../../middlewares/mcpGatewayAuth'

const router = express.Router()

/**
 * MCP gateway callback surface. The agent's `mcpGatewayToken` is the auth —
 * no API key, no JWT. The path is whitelisted in `utils/constants.ts` so the
 * global API-key check skips it; `mcpGatewayAuth` enforces the bearer.
 *
 * v1.8: agent-facing surface speaks MCP Streamable HTTP at `/:agentId` (POST
 * for client→server messages, GET for the server→client SSE channel, DELETE
 * for explicit session termination). The legacy REST endpoints below remain
 * mounted in parallel during the protocol transition and will be removed
 * once the reference agent and external integrations have migrated.
 */
router.post('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)
router.get('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)
router.delete('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)

router.post('/:agentId/tools/invoke', mcpGatewayAuth, mcpGatewayController.invokeTool)
router.get('/:agentId/tools', mcpGatewayAuth, mcpGatewayController.listTools)
router.get('/:agentId/health', mcpGatewayAuth, mcpGatewayController.health)

export default router
