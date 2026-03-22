import express from 'express'
import { requireScope } from '../../middlewares/adminAuth'
import { AdminScope } from '../../Interface'
import adminWebhooksController from '../../controllers/admin/webhooks'

const router = express.Router()

router.get('/', requireScope(AdminScope.WEBHOOKS_READ), adminWebhooksController.getAllWebhooks)
router.get('/:id', requireScope(AdminScope.WEBHOOKS_READ), adminWebhooksController.getWebhookById)
router.post('/', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.createWebhook)
router.put('/:id', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.updateWebhook)
router.delete('/:id', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.deleteWebhook)
router.patch('/:id/toggle', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.toggleWebhook)
router.get('/:id/deliveries', requireScope(AdminScope.WEBHOOKS_READ), adminWebhooksController.getWebhookDeliveries)
router.post('/:id/regenerate-secret', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.regenerateSecret)
router.post('/:id/test', requireScope(AdminScope.WEBHOOKS_WRITE), adminWebhooksController.testWebhook)

export default router
