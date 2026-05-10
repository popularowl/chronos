import express from 'express'
import mcpGatewayMCPController from '../../controllers/mcp-gateway/mcp'
import { mcpGatewayAuth } from '../../middlewares/mcpGatewayAuth'

const router = express.Router()

/**
 * MCP gateway agent-facing surface. The agent presents its `mcpGatewayToken`
 * as a Bearer credential at MCP `initialize`; the path is whitelisted in
 * `utils/constants.ts` so the global API-key check skips it and
 * `mcpGatewayAuth` enforces the bearer.
 *
 * Streamable HTTP transport per the upstream MCP specification:
 *   POST   — client → server JSON-RPC messages (initialize, tools/list, tools/call)
 *   GET    — server → client SSE channel (carries notifications/tools/list_changed)
 *   DELETE — explicit session termination (sessions also expire on idle timeout)
 */
router.post('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)
router.get('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)
router.delete('/:agentId', mcpGatewayAuth, mcpGatewayMCPController.handle)

export default router
