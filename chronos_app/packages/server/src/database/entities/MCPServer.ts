/* eslint-disable */
import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { IMCPServer, MCPServerStatus, MCPServerTransport } from '../../Interface'

/**
 * MCPServer registry entry.
 *
 * Registered MCP server (transport + url/command + auth + allowedTools) used
 * by the platform's MCP gateway. Agents reach tools through the gateway and
 * never call MCP servers directly. The `slug` is used as the namespace prefix
 * in tool names: tools surface to agents as `<slug>.<tool>` (e.g.
 * `postgres.query`). v1.6.0 supports `streamable-http` and `sse` transports;
 * v1.8.0 adds `stdio` (spawn-and-pool child processes) — `args` and `env`
 * carry the stdio-specific config (additive nullable columns). Secret values
 * in `env` / `args` may be credential references resolved at spawn time so
 * the row stays free of decrypted material.
 */
@Entity()
@Index('IDX_mcp_server_slug', ['slug'], { unique: true })
export class MCPServer implements IMCPServer {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'varchar' })
    slug: string

    @Column({ nullable: true, type: 'text' })
    description?: string

    @Index()
    @Column({ type: 'varchar', length: 20 })
    transport: MCPServerTransport

    @Column({ nullable: true, type: 'varchar' })
    url?: string

    @Column({ nullable: true, type: 'text' })
    command?: string

    @Column({ nullable: true, type: 'text' })
    args?: string

    @Column({ nullable: true, type: 'text' })
    env?: string

    @Column({ nullable: true, type: 'text' })
    outboundAuth?: string

    @Column({ nullable: true, type: 'text' })
    allowedTools?: string

    @Column({ nullable: true, type: 'text' })
    requestHeaders?: string

    @Column({ nullable: true, type: 'int' })
    timeoutMs?: number

    @Column({ nullable: true, type: 'text' })
    policies?: string

    @Column({ type: 'varchar', length: 20, default: MCPServerStatus.UNKNOWN })
    status: MCPServerStatus

    @Index()
    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ nullable: true })
    lastHealthCheckAt?: Date

    @Column({ nullable: true, type: 'text' })
    lastHealthError?: string

    @Column({ nullable: true, type: 'varchar' })
    userId?: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
