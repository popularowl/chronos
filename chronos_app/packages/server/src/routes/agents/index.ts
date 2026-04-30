import express from 'express'
import agentsController from '../../controllers/agents'
import { checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

router.post('/', checkPermission('agents:create'), agentsController.createAgent)

router.get('/', checkPermission('agents:view'), agentsController.getAllAgents)
router.get('/:id', checkPermission('agents:view'), agentsController.getAgentById)

router.put('/:id', checkPermission('agents:update'), agentsController.updateAgent)
router.patch('/:id/toggle', checkPermission('agents:update'), agentsController.toggleAgent)

router.delete('/:id', checkPermission('agents:delete'), agentsController.deleteAgent)

router.post('/:id/regenerate-callback-token', checkPermission('agents:update'), agentsController.regenerateCallbackToken)
router.post('/:id/test-connection', checkPermission('agents:update'), agentsController.testAgentConnection)

export default router
