import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { IWebhook } from '../../Interface'
import { AgentFlow } from './AgentFlow'

@Entity()
export class Webhook implements IWebhook {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'varchar' })
    url: string

    @Index()
    @Column({ type: 'uuid' })
    agentflowId: string

    @Column({ type: 'text' })
    events: string

    @Column({ nullable: true, type: 'varchar' })
    secret?: string

    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ type: 'int', default: 3 })
    maxRetries: number

    @Column({ type: 'int', default: 10000 })
    timeoutMs: number

    @Column({ nullable: true, type: 'varchar' })
    userId?: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @ManyToOne(() => AgentFlow)
    @JoinColumn({ name: 'agentflowId' })
    agentflow: AgentFlow
}
