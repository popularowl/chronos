import express from 'express'
import { requireScope } from '../../middlewares/adminAuth'
import { AdminScope } from '../../Interface'
import adminAgentsController from '../../controllers/admin/agents'

const router = express.Router()

router.get('/', requireScope(AdminScope.AGENTS_READ), adminAgentsController.getAllAgents)
router.get('/:id', requireScope(AdminScope.AGENTS_READ), adminAgentsController.getAgentById)
router.post('/', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.createAgent)
router.put('/:id', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.updateAgent)
router.delete('/:id', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.deleteAgent)
router.patch('/:id/toggle', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.toggleAgent)
router.post('/:id/regenerate-callback-token', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.regenerateCallbackToken)
router.post('/:id/test-connection', requireScope(AdminScope.AGENTS_WRITE), adminAgentsController.testAgentConnection)

export default router
