import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

/**
 * Persistent audit row for every MCP tool invocation brokered through the
 * Chronos gateway. One row per call (success or failure). Promoted from
 * v1.6's structured `logger.info({ event: 'mcp.tool.invoke' })` lines so
 * post-hoc queries (compliance, billing, debugging) don't depend on log
 * aggregator state.
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

    @Index()
    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date
}
