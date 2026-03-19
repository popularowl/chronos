import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSchedule1800000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS schedule (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "cronExpression" varchar NOT NULL,
                "timezone" varchar NOT NULL DEFAULT 'UTC',
                "agentflowId" uuid NOT NULL,
                "inputPayload" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "lastRunDate" timestamp NULL,
                "nextRunDate" timestamp NULL,
                "lastRunStatus" varchar NULL,
                "userId" varchar(36) NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_schedule" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_schedule_agentflowId" ON schedule ("agentflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_schedule_enabled" ON schedule ("enabled");`)

        await queryRunner.query(`ALTER TABLE execution ADD COLUMN IF NOT EXISTS "scheduleId" uuid NULL;`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_execution_scheduleId" ON execution ("scheduleId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_execution_scheduleId";`)
        await queryRunner.query(`ALTER TABLE execution DROP COLUMN IF EXISTS "scheduleId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_schedule_enabled";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_schedule_agentflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS schedule;`)
    }
}
