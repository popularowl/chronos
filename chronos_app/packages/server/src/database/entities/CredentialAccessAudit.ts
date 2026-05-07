import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

/**
 * Persistent audit row for every server-side `decryptCredentialData` call.
 * Promoted from v1.7 § 3d. Sibling table to `tool_invocation_audit` — kept
 * separate because the primary axis is `credentialId` and the surrounding
 * shape (no `mcpServerId` / `toolName`, presence of `requestPath` / `source`)
 * doesn't fit the tool-invocation columns cleanly.
 *
 * Writes are best-effort fire-and-forget — see `auditService.recordCredentialAccess`.
 *
 * Coverage gap: components-side `getCredentialData` (the tool-node path)
 * is NOT instrumented in 3d-MVP. That's a separate follow-up; tracked
 * under v1.7 § 4 carve-outs.
 */
@Entity()
export class CredentialAccessAudit {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    credentialId: string

    @Index()
    @Column({ type: 'varchar', nullable: true })
    userId: string | null

    @Index()
    @Column({ type: 'uuid', nullable: true })
    agentId: string | null

    @Index()
    @Column({ type: 'varchar' })
    source: string

    @Column({ type: 'varchar', nullable: true })
    requestPath: string | null

    @Index()
    @Column({ type: 'boolean' })
    success: boolean

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null

    @Index()
    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date
}
