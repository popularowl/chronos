import express from 'express'
import nodesController from '../../controllers/nodes'
const router = express.Router()

// READ
router.get('/', nodesController.getAllNodes)
router.get('/chatmodels', nodesController.getChatModels)
router.get(['/', '/:name'], nodesController.getNodeByName)
router.get('/category/:name', nodesController.getNodesByCategory)

// CREATE
router.post('/generate/instruction', nodesController.generateInstruction)

export default router
