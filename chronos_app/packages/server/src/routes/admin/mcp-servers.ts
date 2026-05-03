import express from 'express'
import { requireScope } from '../../middlewares/adminAuth'
import { AdminScope } from '../../Interface'
import adminMCPServersController from '../../controllers/admin/mcp-servers'

const router = express.Router()

router.get('/', requireScope(AdminScope.MCP_SERVERS_READ), adminMCPServersController.getAllMCPServers)
router.get('/:id', requireScope(AdminScope.MCP_SERVERS_READ), adminMCPServersController.getMCPServerById)
router.post('/', requireScope(AdminScope.MCP_SERVERS_WRITE), adminMCPServersController.createMCPServer)
router.put('/:id', requireScope(AdminScope.MCP_SERVERS_WRITE), adminMCPServersController.updateMCPServer)
router.delete('/:id', requireScope(AdminScope.MCP_SERVERS_WRITE), adminMCPServersController.deleteMCPServer)
router.patch('/:id/toggle', requireScope(AdminScope.MCP_SERVERS_WRITE), adminMCPServersController.toggleMCPServer)
router.post('/:id/test-connection', requireScope(AdminScope.MCP_SERVERS_WRITE), adminMCPServersController.testMCPServerConnection)
router.get('/:id/tools', requireScope(AdminScope.MCP_SERVERS_READ), adminMCPServersController.listMCPServerTools)
router.post('/preview-tools', requireScope(AdminScope.MCP_SERVERS_READ), adminMCPServersController.previewMCPServerTools)

export default router
