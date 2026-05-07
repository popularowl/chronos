import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import auditService, { ToolInvocationAuditFilters } from '../../services/audit'

/**
 * Pulls every recognised audit filter out of `req.query`. Unknown / empty
 * values are silently dropped so callers can pass partial filter sets.
 */
const parseFilters = (req: Request): ToolInvocationAuditFilters => {
    const q = req.query as Record<string, unknown>
    const filters: ToolInvocationAuditFilters = {}
    if (typeof q.agentId === 'string' && q.agentId) filters.agentId = q.agentId
    if (typeof q.mcpServerId === 'string' && q.mcpServerId) filters.mcpServerId = q.mcpServerId
    if (typeof q.namespacedTool === 'string' && q.namespacedTool) filters.namespacedTool = q.namespacedTool
    if (typeof q.callId === 'string' && q.callId) filters.callId = q.callId
    if (typeof q.userId === 'string' && q.userId) filters.userId = q.userId
    if (typeof q.startDate === 'string' && q.startDate) filters.startDate = q.startDate
    if (typeof q.endDate === 'string' && q.endDate) filters.endDate = q.endDate
    if (typeof q.success === 'string') {
        if (q.success === 'true') filters.success = true
        else if (q.success === 'false') filters.success = false
        else throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid success filter: ${q.success}`)
    }
    return filters
}

const parsePagination = (req: Request): { page?: number; limit?: number } => {
    const result: { page?: number; limit?: number } = {}
    if (typeof req.query.page === 'string') {
        const page = parseInt(req.query.page, 10)
        if (isNaN(page) || page < 1) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid page: ${req.query.page}`)
        }
        result.page = page
    }
    if (typeof req.query.limit === 'string') {
        const limit = parseInt(req.query.limit, 10)
        if (isNaN(limit) || limit < 1) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid limit: ${req.query.limit}`)
        }
        result.limit = limit
    }
    return result
}

const listToolInvocations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filters = parseFilters(req)
        const format = typeof req.query.format === 'string' ? req.query.format : undefined

        if (format === 'csv') {
            const csv = await auditService.exportToolInvocationsCsv(filters)
            const filename = `tool_invocations_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`)
            return res.send(csv)
        }

        const pagination = parsePagination(req)
        const result = await auditService.listToolInvocations(filters, pagination)
        // Preserve the 3a `{ rows }` envelope when no pagination is requested
        // (smoke runner and other unpaginated callers depend on this shape).
        // Paginated requests get the full `{ rows, total, page, limit }` envelope.
        if (Array.isArray(result)) {
            return res.json({ rows: result })
        }
        return res.json({ rows: result.data, total: result.total, page: pagination.page, limit: pagination.limit })
    } catch (error) {
        next(error)
    }
}

/**
 * Minimal v1.7 § 3d read surface — single endpoint for credentialId-scoped
 * lookups. The full filter API arrives in a follow-up; this is enough for
 * unit smoke and operator spot-checks.
 */
const listCredentialAccess = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId : undefined
        if (!credentialId) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                'Error: auditController.listCredentialAccess - credentialId query parameter is required'
            )
        }
        const rows = await auditService.listCredentialAccessByCredentialId(credentialId)
        return res.json({ rows })
    } catch (error) {
        next(error)
    }
}

export default {
    listToolInvocations,
    listCredentialAccess
}
