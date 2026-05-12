import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'
import { IMCPServerChangeLog, MCPServerChangeKind } from '../../Interface'

/**
 * Per-mutation history for `mcp_server` rows. One entry per create / update /
 * delete / enable-disable, attributed to the Chronos user who made the change
 * via `userId` + a snapshot of `userEmail` (the user row may be deleted later
 * but the log entry stays correct).
 *
 * Writes are fire-and-forget from `mcpServersService`; if the log write
 * fails the underlying mutation still succeeds. Secret values
 * (`outboundAuth.bearerToken`, `requestHeaders.*.value`, etc.) are redacted
 * to `***` in `changedFields` at the service layer before the row is
 * written — the table never carries raw secrets.
 *
 * Surfaces on the **History** tab of `MCPServerDetail` (v1.8.0 Group A — UI
 * slice A2).
 */
@Entity()
@Index('IDX_mcp_server_change_log_server_created', ['mcpServerId', 'createdDate'])
export class MCPServerChangeLog implements IMCPServerChangeLog {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    mcpServerId: string

    @Index()
    @Column({ type: 'varchar', nullable: true })
    userId: string | null

    @Column({ type: 'varchar', nullable: true })
    userEmail: string | null

    @Column({ type: 'varchar', length: 20 })
    changeKind: MCPServerChangeKind

    @Column({ type: 'text', nullable: true })
    changedFields: string | null

    @Column({ type: 'varchar' })
    changeSummary: string

    @Index()
    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date
}
