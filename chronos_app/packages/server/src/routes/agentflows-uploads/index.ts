import express from 'express'
import agentflowsController from '../../controllers/agentflows'

const router = express.Router()

// READ
router.get(['/', '/:id'], agentflowsController.checkIfAgentflowIsValidForUploads)

export default router
