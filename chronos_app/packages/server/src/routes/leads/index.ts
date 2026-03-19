import express from 'express'
import leadsController from '../../controllers/leads'
const router = express.Router()

// CREATE
router.post('/', leadsController.createLeadInAgentflow)

// READ
router.get(['/', '/:id'], leadsController.getAllLeadsForAgentflow)

export default router
