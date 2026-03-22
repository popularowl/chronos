/**
 * Admin API Router — mounts all admin sub-routes with admin auth middleware.
 */

import express from 'express'
import { adminAuthMiddleware } from '../../middlewares/adminAuth'
import agentflowsRouter from './agentflows'
import credentialsRouter from './credentials'
import apikeysRouter from './apikeys'
import oauthClientsRouter from './oauth-clients'
import schedulesRouter from './schedules'
import webhooksRouter from './webhooks'

const router = express.Router()

// All admin routes require a valid client credentials JWT
router.use(adminAuthMiddleware)

router.use('/agentflows', agentflowsRouter)
router.use('/credentials', credentialsRouter)
router.use('/apikeys', apikeysRouter)
router.use('/oauth-clients', oauthClientsRouter)
router.use('/schedules', schedulesRouter)
router.use('/webhooks', webhooksRouter)

export default router
