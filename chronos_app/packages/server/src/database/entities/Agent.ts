/* eslint-disable */
import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { AgentRuntimeType, AgentStatus, IAgent } from '../../Interface'

/**
 * Agent registry entry.
 *
 * Shaped as a superset of the A2A Agent Card spec
 * (https://a2a-protocol.org/latest/specification/) so a future A2A runtime
 * can publish `/.well-known/agent.json` from these columns without a schema
 * change. Chronos-specific fields (runtimeType, status, runtimeConfig,
 * outboundAuth, callbackToken, allowedTools, builtinAgentflowId, health
 * tracking) are kept distinct from the declarative A2A surface.
 */
@Entity()
@Index('IDX_agent_slug', ['slug'], { unique: true })
export class Agent implements IAgent {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'varchar' })
    slug: string

    @Column({ nullable: true, type: 'text' })
    description?: string

    @Column({ type: 'varchar', default: '1.0.0' })
    version: string

    @Column({ nullable: true, type: 'varchar' })
    protocolVersion?: string

    @Column({ nullable: true, type: 'varchar' })
    iconUrl?: string

    @Column({ nullable: true, type: 'text' })
    provider?: string

    @Column({ nullable: true, type: 'varchar' })
    documentationUrl?: string

    @Column({ nullable: true, type: 'text' })
    capabilities?: string

    @Column({ nullable: true, type: 'text' })
    skills?: string

    @Column({ nullable: true, type: 'text' })
    defaultInputModes?: string

    @Column({ nullable: true, type: 'text' })
    defaultOutputModes?: string

    @Column({ nullable: true, type: 'varchar' })
    serviceEndpoint?: string

    @Column({ nullable: true, type: 'text' })
    interfaces?: string

    @Column({ nullable: true, type: 'text' })
    securitySchemes?: string

    @Column({ nullable: true, type: 'text' })
    security?: string

    @Index()
    @Column({ type: 'varchar', length: 20, default: AgentRuntimeType.BUILT_IN })
    runtimeType: AgentRuntimeType

    @Column({ type: 'varchar', length: 20, default: AgentStatus.UNKNOWN })
    status: AgentStatus

    @Index()
    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ nullable: true, type: 'text' })
    runtimeConfig?: string

    @Column({ nullable: true, type: 'text' })
    outboundAuth?: string

    @Column({ nullable: true, type: 'varchar' })
    callbackToken?: string

    @Column({ nullable: true, type: 'text' })
    allowedTools?: string

    @Index()
    @Column({ nullable: true, type: 'uuid' })
    builtinAgentflowId?: string

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
