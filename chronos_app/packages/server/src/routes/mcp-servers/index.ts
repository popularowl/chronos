import express from 'express'
import mcpServersController from '../../controllers/mcp-servers'
import { checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

router.post('/', checkPermission('mcp-servers:create'), mcpServersController.createMCPServer)

// `presets` is a static catalogue route — declared before the `/:id`
// param route so it isn't swallowed by the dynamic match. Gated by
// `mcp-servers:create` because the picker is a creation affordance.
router.get('/presets', checkPermission('mcp-servers:create'), mcpServersController.listMCPServerPresets)

router.get('/', checkPermission('mcp-servers:view'), mcpServersController.getAllMCPServers)
router.get('/:id', checkPermission('mcp-servers:view'), mcpServersController.getMCPServerById)

router.put('/:id', checkPermission('mcp-servers:update'), mcpServersController.updateMCPServer)
router.patch('/:id/toggle', checkPermission('mcp-servers:update'), mcpServersController.toggleMCPServer)

router.delete('/:id', checkPermission('mcp-servers:delete'), mcpServersController.deleteMCPServer)

router.post('/:id/test-connection', checkPermission('mcp-servers:update'), mcpServersController.testMCPServerConnection)
router.get('/:id/tools', checkPermission('mcp-servers:view'), mcpServersController.listMCPServerTools)
router.get('/:id/change-log', checkPermission('mcp-servers:view'), mcpServersController.getMCPServerChangeLog)
router.post('/preview-tools', checkPermission('mcp-servers:view'), mcpServersController.previewMCPServerTools)

export default router
