import { ToolInvocationAudit } from '../../database/entities/ToolInvocationAudit'
import { CredentialAccessAudit } from '../../database/entities/CredentialAccessAudit'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createModuleLogger } from '../../utils/logger'
import { PolicyOutcome } from '../../Interface'

const logger = createModuleLogger('auditService')
import { StatusCodes } from 'http-status-codes'

/**
 * Hard cap on CSV export rows. Prevents an operator-mistake DoS where a
 * filter-less export would dump the entire audit table into memory. Operators
 * who need more than 10k rows should narrow the time window or paginate via
 * the JSON endpoint. Constant rather than env-var per the v1.7 § 3 "no env
 * gates unless tunable" rule.
 */
const CSV_EXPORT_ROW_CAP = 10000

/**
 * Input shape for `recordToolInvocation`. Caller fills every field at the
 * gateway invoke site; the service does no enrichment.
 */
export interface ToolInvocationAuditInput {
    agentId: string
    agentSlug: string
    mcpServerId: string | null
    mcpServerSlug: string
    toolName: string
    namespacedTool: string
    success: boolean
    durationMs: number
    errorMessage: string | null
    callId: string | null
    userId: string | null
    /**
     * Reliability-policy verdict for this call. Null on pre-v1.8 callsites
     * that haven't been routed through the policy chain yet; one of
     * `PolicyOutcome` for v1.8+ callsites. v1.8.0 Group A.
     */
    policyOutcome?: PolicyOutcome | null
    /**
     * Redacted + size-capped MCP `tools/call` request `arguments` and
     * response `result`. Both NULL unless `AUDIT_FULL_PAYLOADS=true`.
     * The gateway runs the raw values through `prepareForAudit` before
     * passing them here — never store unredacted payloads. Typed as `any`
     * to match the entity column (TypeORM's `DeepPartial` chokes on
     * `unknown` JSON-transformer columns).
     */
    requestPayload?: any
    responsePayload?: any
}

/**
 * Filter axes for the tool-invocation audit list / export endpoints. All
 * fields optional; absence of a filter omits the corresponding `andWhere`.
 * Maps 1:1 with the indexes added in migration `1800000000010`.
 */
export interface ToolInvocationAuditFilters {
    agentId?: string
    mcpServerId?: string
    namespacedTool?: string
    success?: boolean
    callId?: string
    userId?: string
    /** Filter by reliability-policy verdict. v1.8.0 Group A. */
    policyOutcome?: PolicyOutcome
    /** Inclusive lower bound on `createdDate`; ISO 8601. */
    startDate?: string
    /** Inclusive upper bound on `createdDate`; ISO 8601. */
    endDate?: string
}

/**
 * Best-effort audit write. Inserts one row per MCP tool invocation. Failures
 * are swallowed and logged at WARN — never propagate to the caller, since the
 * structured `logger.info({ event: 'mcp.tool.invoke' })` line at the gateway
 * remains as the streaming / fallback record. Caller should fire-and-forget
 * (no `await`) to keep the gateway hot path off the DB write.
 */
const recordToolInvocation = async (input: ToolInvocationAuditInput): Promise<void> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(ToolInvocationAudit)
        await repo.insert(input)
    } catch (error) {
        logger.warn(`recordToolInvocation failed: ${getErrorMessage(error)}`)
    }
}

/**
 * Builds a query-builder with every present filter applied. Used by both the
 * paginated list endpoint and the CSV export so the WHERE clauses stay in
 * sync. Validates date strings up front and throws 400 on bad input.
 */
const buildFilteredQuery = (filters: ToolInvocationAuditFilters) => {
    const repo = getRunningExpressApp().AppDataSource.getRepository(ToolInvocationAudit)
    const qb = repo.createQueryBuilder('audit').orderBy('audit.createdDate', 'DESC')

    if (filters.agentId) qb.andWhere('audit.agentId = :agentId', { agentId: filters.agentId })
    if (filters.mcpServerId) qb.andWhere('audit.mcpServerId = :mcpServerId', { mcpServerId: filters.mcpServerId })
    if (filters.namespacedTool) qb.andWhere('audit.namespacedTool = :namespacedTool', { namespacedTool: filters.namespacedTool })
    if (typeof filters.success === 'boolean') qb.andWhere('audit.success = :success', { success: filters.success })
    if (filters.callId) qb.andWhere('audit.callId = :callId', { callId: filters.callId })
    if (filters.userId) qb.andWhere('audit.userId = :userId', { userId: filters.userId })
    if (filters.policyOutcome) qb.andWhere('audit.policyOutcome = :policyOutcome', { policyOutcome: filters.policyOutcome })

    if (filters.startDate) {
        const startDate = new Date(filters.startDate)
        if (isNaN(startDate.getTime())) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid startDate: ${filters.startDate}`)
        }
        qb.andWhere('audit.createdDate >= :startDate', { startDate })
    }
    if (filters.endDate) {
        const endDate = new Date(filters.endDate)
        if (isNaN(endDate.getTime())) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Invalid endDate: ${filters.endDate}`)
        }
        qb.andWhere('audit.createdDate <= :endDate', { endDate })
    }

    return qb
}

/**
 * Filter + paginate tool-invocation audit rows. When `page` and `limit` are
 * both positive, returns `{ data, total }`; otherwise returns the full
 * matching set as `data[]` (matches the convention used by `mcp-servers`
 * and `agents` services).
 */
const listToolInvocations = async (
    filters: ToolInvocationAuditFilters = {},
    pagination: { page?: number; limit?: number } = {}
): Promise<ToolInvocationAudit[] | { data: ToolInvocationAudit[]; total: number }> => {
    const qb = buildFilteredQuery(filters)
    const { page, limit } = pagination
    if (typeof page === 'number' && typeof limit === 'number' && page > 0 && limit > 0) {
        qb.skip((page - 1) * limit).take(limit)
        const [data, total] = await qb.getManyAndCount()
        return { data, total }
    }
    return qb.getMany()
}

/**
 * Serialise filtered audit rows as CSV. Capped at `CSV_EXPORT_ROW_CAP` to
 * prevent runaway memory. Header line is fixed (matches the entity column
 * order) so consumers can rely on a stable schema. Each cell is JSON-encoded
 * to handle commas, quotes, newlines, and nulls uniformly.
 */
const exportToolInvocationsCsv = async (filters: ToolInvocationAuditFilters = {}): Promise<string> => {
    const qb = buildFilteredQuery(filters).take(CSV_EXPORT_ROW_CAP)
    const rows = await qb.getMany()

    const headers = [
        'id',
        'agentId',
        'agentSlug',
        'mcpServerId',
        'mcpServerSlug',
        'toolName',
        'namespacedTool',
        'success',
        'durationMs',
        'errorMessage',
        'callId',
        'userId',
        'policyOutcome',
        'requestPayload',
        'responsePayload',
        'createdDate'
    ] as const

    const serialiseCell = (value: unknown): string => {
        if (value === null || value === undefined) return ''
        if (value instanceof Date) return JSON.stringify(value.toISOString())
        return JSON.stringify(value)
    }

    const lines = [headers.join(',')]
    for (const row of rows) {
        const indexable = row as unknown as Record<string, unknown>
        lines.push(headers.map((h) => serialiseCell(indexable[h])).join(','))
    }
    return lines.join('\n')
}

/**
 * Input shape for `recordCredentialAccess`. Source is the only required
 * non-id field; everything else (userId, agentId, requestPath, errorMessage)
 * is null for sparse-context callers.
 */
export interface CredentialAccessAuditInput {
    credentialId: string
    userId: string | null
    agentId: string | null
    source: string
    requestPath: string | null
    success: boolean
    errorMessage: string | null
}

/**
 * Best-effort credential-access audit write. Same fire-and-forget contract
 * as `recordToolInvocation`. Caller (`decryptCredentialData`) should `void`
 * the call so a slow / failing audit insert doesn't block the decrypt path.
 */
const recordCredentialAccess = async (input: CredentialAccessAuditInput): Promise<void> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(CredentialAccessAudit)
        await repo.insert(input)
    } catch (error) {
        logger.warn(`recordCredentialAccess failed: ${getErrorMessage(error)}`)
    }
}

/**
 * Minimal read-side helper for the smoke / unit test surface and the future
 * 3d filter API. Returns every audit row for a given `credentialId`,
 * chronological-ASC. Empty array if the credentialId is unknown.
 */
const listCredentialAccessByCredentialId = async (credentialId: string): Promise<CredentialAccessAudit[]> => {
    const repo = getRunningExpressApp().AppDataSource.getRepository(CredentialAccessAudit)
    return repo.find({ where: { credentialId }, order: { createdDate: 'ASC' } })
}

export default {
    recordToolInvocation,
    listToolInvocations,
    exportToolInvocationsCsv,
    recordCredentialAccess,
    listCredentialAccessByCredentialId
}
