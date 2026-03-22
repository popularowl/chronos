import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'
import { IWebhookDelivery } from '../../Interface'

@Entity()
export class WebhookDelivery implements IWebhookDelivery {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    webhookId: string

    @Index()
    @Column({ type: 'uuid' })
    executionId: string

    @Index()
    @Column({ type: 'uuid' })
    agentflowId: string

    @Column({ type: 'varchar' })
    event: string

    @Column({ type: 'text' })
    payload: string

    @Column({ nullable: true, type: 'int' })
    statusCode?: number

    @Column({ nullable: true, type: 'text' })
    responseBody?: string

    @Column({ type: 'int', default: 1 })
    attempt: number

    @Column({ type: 'boolean', default: false })
    success: boolean

    @Column({ nullable: true, type: 'text' })
    errorMessage?: string

    @Column({ nullable: true })
    deliveredAt?: Date

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date
}
