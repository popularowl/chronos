import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { IEvaluation } from '../../Interface'

@Entity()
export class Evaluation implements IEvaluation {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'text' })
    average_metrics: string

    @Column({ type: 'text' })
    additionalConfig: string

    @Column()
    name: string

    @Column()
    evaluationType: string

    @Column()
    agentflowId: string

    @Column()
    agentflowName: string

    @Column()
    datasetId: string

    @Column()
    datasetName: string

    @Column()
    status: string

    @UpdateDateColumn()
    runDate: Date
}
