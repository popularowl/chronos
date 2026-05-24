import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'
import { PolicyOutcome } from '../../Interface'

/**
 * Stores JSON values as text in both sqlite + postgres without forcing
 * callers to deal with the wire format. Null/undefined round-trip as NULL.
 * String values that already happen to be valid JSON are still re-serialized
 * (so a stored value is always a JSON literal of the original shape).
 */
const jsonTransformer = {
    to: (value: unknown): string | null => (value == null ? null : JSON.stringify(value)),
    from: (value: string | null): unknown => {
        if (value == null) return null
        try {
            return JSON.parse(value)
        } catch {
            return value
        }
    }
}

/**
 * Persistent audit row for every MCP tool invocation brokered through the
 * Chronos gateway. One row per call (success or failure).
 *
 * Writes are best-effort and fire-and-forget — see `auditService.recordToolInvocation`.
 * The structured logger.info line is kept as the streaming/fallback record.
 */
@Entity()
@Index('IDX_tool_invocation_audit_agent_created', ['agentId', 'createdDate'])
export class ToolInvocationAudit {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    agentId: string

    @Column({ type: 'varchar' })
    agentSlug: string

    @Index()
    @Column({ type: 'uuid', nullable: true })
    mcpServerId: string | null

    @Column({ type: 'varchar' })
    mcpServerSlug: string

    @Column({ type: 'varchar' })
    toolName: string

    @Index()
    @Column({ type: 'varchar' })
    namespacedTool: string

    @Index()
    @Column({ type: 'boolean' })
    success: boolean

    @Column({ type: 'int', default: 0 })
    durationMs: number

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null

    @Index()
    @Column({ type: 'varchar', nullable: true })
    callId: string | null

    @Index()
    @Column({ type: 'varchar', nullable: true })
    userId: string | null

    /**
     * Reliability-policy verdict for this invocation. NULL for pre-v1.8 rows
     * that pre-date the policy chain; one of `PolicyOutcome` for v1.8+ rows.
     */
    @Index()
    @Column({ type: 'varchar', nullable: true })
    policyOutcome: PolicyOutcome | null

    /**
     * Stringified MCP `tools/call` `arguments` object as dispatched by the
     * gateway. NULL when payload capture is disabled (`AUDIT_FULL_PAYLOADS`)
     * Redacted + size-capped at the gateway before
     * write — never stored raw. See `utils/redactPayload.util.ts`. Typed as
     * `any` so TypeORM's `DeepPartial` insertion type stays usable; the
     * transformer round-trips any JSON-serializable shape.
     */
    @Column({ type: 'text', nullable: true, transformer: jsonTransformer })
    requestPayload: any

    /**
     * Stringified MCP `tools/call` result object as returned by the
     * upstream server. NULL on errors (the `errorMessage` column carries
     * failure shape) and when payload capture is disabled. Redacted +
     * size-capped at the gateway before write.
     */
    @Column({ type: 'text', nullable: true, transformer: jsonTransformer })
    responsePayload: any

    @Index()
    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date
}
