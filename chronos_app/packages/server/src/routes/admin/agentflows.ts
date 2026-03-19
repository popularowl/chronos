/**
 * Admin Agentflows Routes — CRUD endpoints for agentflows and multiagent flows.
 */

import express from 'express'
import { requireScope } from '../../middlewares/adminAuth'
import { AdminScope } from '../../Interface'
import adminController from '../../controllers/admin'

const router = express.Router()

router.get('/', requireScope(AdminScope.AGENTFLOWS_READ), adminController.getAllAgentflows)
router.get('/:id', requireScope(AdminScope.AGENTFLOWS_READ), adminController.getAgentflowById)
router.post('/', requireScope(AdminScope.AGENTFLOWS_WRITE), adminController.createAgentflow)
router.put('/:id', requireScope(AdminScope.AGENTFLOWS_WRITE), adminController.updateAgentflow)
router.delete('/:id', requireScope(AdminScope.AGENTFLOWS_WRITE), adminController.deleteAgentflow)

export default router
