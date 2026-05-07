import express from 'express'
import auditController from '../../controllers/audit'
import { checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

// Minimal v1.7 § 3a read surface — single endpoint for callId-scoped lookups
// (smoke test + § 6 HTTP-agent execution viewer dependency). 3b expanded the
// filter surface + CSV export on the same path.
router.get('/tool-invocations', checkPermission('mcp-servers:view'), auditController.listToolInvocations)

// v1.7 § 3d minimal credential-access read surface. Auth scope intentionally
// different from tool-invocations (`credentials:view`) — the data sensitivity
// is also different (caller userId / requestPath / agentId).
router.get('/credential-access', checkPermission('credentials:view'), auditController.listCredentialAccess)

export default router
