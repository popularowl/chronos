import express from 'express'
import feedbackController from '../../controllers/feedback'
const router = express.Router()

// CREATE
router.post(['/', '/:id'], feedbackController.createChatMessageFeedbackForAgentflow)

// READ
router.get(['/', '/:id'], feedbackController.getAllChatMessageFeedback)

// UPDATE
router.put(['/', '/:id'], feedbackController.updateChatMessageFeedbackForAgentflow)

export default router
