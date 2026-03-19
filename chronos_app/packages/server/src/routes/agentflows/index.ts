import express from 'express'
import agentflowsController from '../../controllers/agentflows'
import { checkAnyPermission } from '../../utils/openSourceStubs'
const router = express.Router()

// CREATE
router.post('/', checkAnyPermission('agentflows:create,agentflows:update'), agentflowsController.saveAgentflow)

// READ
router.get('/', checkAnyPermission('agentflows:view,agentflows:update'), agentflowsController.getAllAgentflows)
router.get(['/', '/:id'], checkAnyPermission('agentflows:view,agentflows:update,agentflows:delete'), agentflowsController.getAgentflowById)
router.get(['/apikey/', '/apikey/:apikey'], agentflowsController.getAgentflowByApiKey)

// UPDATE
router.put(['/', '/:id'], checkAnyPermission('agentflows:create,agentflows:update'), agentflowsController.updateAgentflow)

// DELETE
router.delete(['/', '/:id'], checkAnyPermission('agentflows:delete'), agentflowsController.deleteAgentflow)

// CHECK FOR CHANGE
router.get(
    '/has-changed/:id/:lastUpdatedDateTime',
    checkAnyPermission('agentflows:update'),
    agentflowsController.checkIfAgentflowHasChanged
)

export default router
