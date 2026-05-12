import { StatusCodes } from 'http-status-codes'
import { MCPServerChangeLog } from '../../database/entities/MCPServerChangeLog'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { createModuleLogger } from '../../utils/logger'
import { MCPServerChangeKind } from '../../Interface'

const logger = createModuleLogger('MCPServerChangeLog')

/**
 * Fields whose values are secrets and must be redacted before being written
 * to the change log. The diff records `***` for both `before` and `after`
 * when the field is one of these; the user still sees that *something*
 * changed without leaking the secret itself.
 */
const SECRET_FIELDS = new Set<string>(['outboundAuth.bearerToken', 'requestHeaders'])

/**
 * Caller-supplied snapshot of the user who triggered the change. Both
 * fields are optional — anonymous / system writes (e.g. background jobs)
 * pass `{ userId: null, userEmail: null }`. `userEmail` is snapshotted
 * because the user row may later be deleted but the log entry must stay
 * interpretable.
 */
export interface ChangeActor {
    userId: string | null
    userEmail: string | null
}

/**
 * Input shape for `recordCreate`. Caller passes the just-persisted server
 * fields verbatim; the service produces a diff against the conceptual
 * empty / pre-existing row.
 */
export interface CreateChangeInput {
    mcpServerId: string
    snapshot: Record<string, unknown>
    actor: ChangeActor
}

/**
 * Input shape for `recordUpdate`. Caller passes a `before` snapshot taken
 * before the persist and an `after` snapshot taken after. The service
 * diffs them, redacts secrets, and produces a row only if at least one
 * field actually changed.
 */
export interface UpdateChangeInput {
    mcpServerId: string
    before: Record<string, unknown>
    after: Record<string, unknown>
    actor: ChangeActor
    /**
     * Marks the mutation as a toggle (enable / disable) rather than a
     * generic update. Produces `ENABLED` / `DISABLED` discriminators
     * which the History tab can render with dedicated iconography.
     */
    kindOverride?: MCPServerChangeKind
}

/**
 * Input shape for `recordDelete`. Caller passes the last-seen entity
 * snapshot; the service writes a final history entry tagged `DELETED`.
 */
export interface DeleteChangeInput {
    mcpServerId: string
    snapshot: Record<string, unknown>
    actor: ChangeActor
}

interface FieldDiff {
    before: unknown
    after: unknown
}

const isSecretField = (field: string): boolean => SECRET_FIELDS.has(field)

const redactValue = (field: string, value: unknown): unknown => {
    if (value === null || value === undefined) return value
    return isSecretField(field) ? '***' : value
}

/**
 * Computes a shallow diff between two property bags, keyed by field name.
 * Returns an empty object if nothing changed. Equality is JSON-stringified
 * comparison so JSON-blob columns like `allowedTools` / `policies` diff
 * by content, not reference.
 */
const computeDiff = (before: Record<string, unknown>, after: Record<string, unknown>): Record<string, FieldDiff> => {
    const diff: Record<string, FieldDiff> = {}
    const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
        const a = before[key]
        const b = after[key]
        if (JSON.stringify(a) === JSON.stringify(b)) continue
        diff[key] = { before: redactValue(key, a), after: redactValue(key, b) }
    }
    return diff
}

const summariseCreate = (snapshot: Record<string, unknown>): string => {
    const name = typeof snapshot.name === 'string' ? snapshot.name : 'MCP server'
    return `Registered ${name}`
}

const summariseDelete = (snapshot: Record<string, unknown>): string => {
    const name = typeof snapshot.name === 'string' ? snapshot.name : 'MCP server'
    return `Deleted ${name}`
}

/**
 * Produces a human-readable one-liner from a diff. Picks the highest-signal
 * field (policies > allowedTools > url > transport > anything else) and
 * mentions it; falls back to "Updated N fields" if many things changed.
 */
const summariseUpdate = (diff: Record<string, FieldDiff>, kindOverride?: MCPServerChangeKind): string => {
    if (kindOverride === MCPServerChangeKind.ENABLED) return 'Enabled server'
    if (kindOverride === MCPServerChangeKind.DISABLED) return 'Disabled server'

    const fieldNames = Object.keys(diff)
    if (fieldNames.length === 0) return 'No-op update'

    const priority = ['policies', 'allowedTools', 'url', 'transport', 'name', 'slug', 'timeoutMs', 'enabled']
    const headline = priority.find((p) => fieldNames.includes(p)) ?? fieldNames[0]

    if (fieldNames.length === 1) return `Updated ${headline}`
    return `Updated ${headline} and ${fieldNames.length - 1} other field${fieldNames.length - 1 === 1 ? '' : 's'}`
}

/**
 * Writes one change-log row. Fire-and-forget contract — failures are
 * swallowed and logged at WARN, never propagated to the caller. This
 * matches `auditService.recordToolInvocation` and ensures a change-log
 * write failure can never block the underlying MCPServer mutation. v1.8.0
 * Group A (locked decision #13).
 */
const writeRow = async (row: {
    mcpServerId: string
    userId: string | null
    userEmail: string | null
    changeKind: MCPServerChangeKind
    changedFields: Record<string, FieldDiff> | null
    changeSummary: string
}): Promise<void> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(MCPServerChangeLog)
        await repo.insert({
            mcpServerId: row.mcpServerId,
            userId: row.userId,
            userEmail: row.userEmail,
            changeKind: row.changeKind,
            changedFields: row.changedFields ? JSON.stringify(row.changedFields) : null,
            changeSummary: row.changeSummary
        })
    } catch (error) {
        logger.warn(`[mcpServerChangeLogService] write failed: ${getErrorMessage(error)}`)
    }
}

const recordCreate = async (input: CreateChangeInput): Promise<void> => {
    const diff: Record<string, FieldDiff> = {}
    for (const [key, value] of Object.entries(input.snapshot)) {
        if (value === null || value === undefined) continue
        diff[key] = { before: null, after: redactValue(key, value) }
    }
    await writeRow({
        mcpServerId: input.mcpServerId,
        userId: input.actor.userId,
        userEmail: input.actor.userEmail,
        changeKind: MCPServerChangeKind.CREATED,
        changedFields: Object.keys(diff).length > 0 ? diff : null,
        changeSummary: summariseCreate(input.snapshot)
    })
}

const recordUpdate = async (input: UpdateChangeInput): Promise<void> => {
    const diff = computeDiff(input.before, input.after)
    if (Object.keys(diff).length === 0) return
    const isToggle = input.kindOverride === MCPServerChangeKind.ENABLED || input.kindOverride === MCPServerChangeKind.DISABLED
    await writeRow({
        mcpServerId: input.mcpServerId,
        userId: input.actor.userId,
        userEmail: input.actor.userEmail,
        changeKind: input.kindOverride ?? MCPServerChangeKind.UPDATED,
        changedFields: isToggle ? null : diff,
        changeSummary: summariseUpdate(diff, input.kindOverride)
    })
}

const recordDelete = async (input: DeleteChangeInput): Promise<void> => {
    await writeRow({
        mcpServerId: input.mcpServerId,
        userId: input.actor.userId,
        userEmail: input.actor.userEmail,
        changeKind: MCPServerChangeKind.DELETED,
        changedFields: null,
        changeSummary: summariseDelete(input.snapshot)
    })
}

/**
 * Returns the change history for one MCP server, newest-first. When `page`
 * and `limit` are both positive, returns `{ data, total }`; otherwise the
 * full set as a flat array (mirrors the convention used by `auditService`
 * and `mcpServersService`).
 */
const listForServer = async (
    mcpServerId: string,
    pagination: { page?: number; limit?: number } = {}
): Promise<MCPServerChangeLog[] | { data: MCPServerChangeLog[]; total: number }> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(MCPServerChangeLog)
        const qb = repo
            .createQueryBuilder('log')
            .where('log.mcpServerId = :mcpServerId', { mcpServerId })
            .orderBy('log.createdDate', 'DESC')
        const { page, limit } = pagination
        if (typeof page === 'number' && typeof limit === 'number' && page > 0 && limit > 0) {
            qb.skip((page - 1) * limit).take(limit)
            const [data, total] = await qb.getManyAndCount()
            return { data, total }
        }
        return qb.getMany()
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: mcpServerChangeLogService.listForServer - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Snapshots the persistent fields of an `MCPServer`-like object into a
 * plain property bag suitable for diffing. Drops auto-managed columns
 * (`createdDate`, `updatedDate`) and the surrogate `id` since they're
 * either set by the database or unchangeable.
 */
export const snapshotMCPServer = (server: Record<string, unknown>): Record<string, unknown> => {
    const snapshot: Record<string, unknown> = {}
    const tracked = [
        'name',
        'slug',
        'description',
        'transport',
        'url',
        'command',
        'outboundAuth',
        'allowedTools',
        'requestHeaders',
        'timeoutMs',
        'policies',
        'enabled'
    ]
    for (const key of tracked) {
        if (server[key] !== undefined) snapshot[key] = server[key]
    }
    return snapshot
}

export default {
    recordCreate,
    recordUpdate,
    recordDelete,
    listForServer,
    snapshotMCPServer
}
