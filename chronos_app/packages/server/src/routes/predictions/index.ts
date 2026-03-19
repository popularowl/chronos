import express from 'express'
import predictionsController from '../../controllers/predictions'
import { getMulterStorage } from '../../utils'

const router = express.Router()

// NOTE: extractAgentflowId function in XSS.ts extracts the agentflow ID from the prediction URL.
// It assumes the URL format is /prediction/{agentflowId}. Make sure to update the function if the URL format changes.
// CREATE
router.post(
    ['/', '/:id'],
    getMulterStorage().array('files'),
    predictionsController.getRateLimiterMiddleware,
    predictionsController.createPrediction
)

export default router
