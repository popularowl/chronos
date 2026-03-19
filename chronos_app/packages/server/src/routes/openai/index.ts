import express from 'express'
import openaiController from '../../controllers/openai'

const router = express.Router()

// POST /api/v1/openai/chat/completions - OpenAI-compatible chat completions
router.post('/chat/completions', openaiController.chatCompletions)

// GET /api/v1/openai/models - List agentflows as models
router.get('/models', openaiController.listModels)

// GET /api/v1/openai/models/:id - Get single agentflow as model
router.get('/models/:id', openaiController.getModel)

export default router
