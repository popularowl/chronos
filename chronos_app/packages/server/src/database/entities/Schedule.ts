import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ISchedule, ExecutionState } from '../../Interface'
import { AgentFlow } from './AgentFlow'

@Entity()
export class Schedule implements ISchedule {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'varchar' })
    cronExpression: string

    @Column({ type: 'varchar', default: 'UTC' })
    timezone: string

    @Index()
    @Column({ type: 'uuid' })
    agentflowId: string

    @Column({ nullable: true, type: 'text' })
    inputPayload?: string

    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ nullable: true })
    lastRunDate?: Date

    @Column({ nullable: true })
    nextRunDate?: Date

    @Column({ nullable: true, type: 'varchar' })
    lastRunStatus?: ExecutionState

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
