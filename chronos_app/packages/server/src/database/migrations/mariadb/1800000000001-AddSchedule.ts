import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSchedule1800000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`schedule\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`cronExpression\` varchar(255) NOT NULL,
                \`timezone\` varchar(255) NOT NULL DEFAULT 'UTC',
                \`agentflowId\` varchar(36) NOT NULL,
                \`inputPayload\` text DEFAULT NULL,
                \`enabled\` tinyint NOT NULL DEFAULT 1,
                \`lastRunDate\` datetime(6) DEFAULT NULL,
                \`nextRunDate\` datetime(6) DEFAULT NULL,
                \`lastRunStatus\` varchar(255) DEFAULT NULL,
                \`userId\` varchar(36) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE INDEX \`IDX_schedule_agentflowId\` ON \`schedule\` (\`agentflowId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_schedule_enabled\` ON \`schedule\` (\`enabled\`);`)

        await queryRunner.query(`ALTER TABLE \`execution\` ADD COLUMN \`scheduleId\` varchar(36) DEFAULT NULL;`)
        await queryRunner.query(`CREATE INDEX \`IDX_execution_scheduleId\` ON \`execution\` (\`scheduleId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_execution_scheduleId\` ON \`execution\`;`)
        await queryRunner.query(`ALTER TABLE \`execution\` DROP COLUMN \`scheduleId\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_schedule_enabled\` ON \`schedule\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_schedule_agentflowId\` ON \`schedule\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`schedule\`;`)
    }
}
