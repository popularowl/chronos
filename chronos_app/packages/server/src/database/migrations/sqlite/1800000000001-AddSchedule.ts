import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSchedule1800000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "schedule" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "cronExpression" varchar NOT NULL,
                "timezone" varchar NOT NULL DEFAULT 'UTC',
                "agentflowId" varchar NOT NULL,
                "inputPayload" text,
                "enabled" boolean NOT NULL DEFAULT 1,
                "lastRunDate" datetime,
                "nextRunDate" datetime,
                "lastRunStatus" varchar,
                "userId" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_schedule_agentflowId" ON "schedule" ("agentflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_schedule_enabled" ON "schedule" ("enabled");`)

        await queryRunner.query(`ALTER TABLE "execution" ADD COLUMN "scheduleId" varchar;`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_execution_scheduleId" ON "execution" ("scheduleId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_execution_scheduleId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_schedule_enabled";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_schedule_agentflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "schedule";`)
    }
}
