import express from 'express'
import webhooksController from '../../controllers/webhooks'
import { checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

// CREATE
router.post('/', checkPermission('webhooks:create'), webhooksController.createWebhook)

// READ
router.get('/', checkPermission('webhooks:view'), webhooksController.getAllWebhooks)
router.get('/:id', checkPermission('webhooks:view'), webhooksController.getWebhookById)

// UPDATE
router.put('/:id', checkPermission('webhooks:update'), webhooksController.updateWebhook)

// TOGGLE
router.patch('/:id/toggle', checkPermission('webhooks:update'), webhooksController.toggleWebhook)

// DELETE
router.delete('/:id', checkPermission('webhooks:delete'), webhooksController.deleteWebhook)

// DELIVERIES
router.get('/:id/deliveries', checkPermission('webhooks:view'), webhooksController.getWebhookDeliveries)

// REGENERATE SECRET
router.post('/:id/regenerate-secret', checkPermission('webhooks:update'), webhooksController.regenerateSecret)

// TEST
router.post('/:id/test', checkPermission('webhooks:update'), webhooksController.testWebhook)

export default router
