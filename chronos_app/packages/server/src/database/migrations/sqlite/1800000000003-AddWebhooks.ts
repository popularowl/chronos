import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWebhooks1800000000003 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "webhook" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "url" varchar NOT NULL,
                "agentflowId" varchar NOT NULL,
                "events" text NOT NULL,
                "secret" varchar,
                "enabled" boolean NOT NULL DEFAULT 1,
                "maxRetries" integer NOT NULL DEFAULT 3,
                "timeoutMs" integer NOT NULL DEFAULT 10000,
                "userId" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_agentflowId" ON "webhook" ("agentflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_enabled" ON "webhook" ("enabled");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "webhook_delivery" (
                "id" varchar PRIMARY KEY NOT NULL,
                "webhookId" varchar NOT NULL,
                "executionId" varchar NOT NULL,
                "agentflowId" varchar NOT NULL,
                "event" varchar NOT NULL,
                "payload" text NOT NULL,
                "statusCode" integer,
                "responseBody" text,
                "attempt" integer NOT NULL DEFAULT 1,
                "success" boolean NOT NULL DEFAULT 0,
                "errorMessage" text,
                "deliveredAt" datetime,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_webhookId" ON "webhook_delivery" ("webhookId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_executionId" ON "webhook_delivery" ("executionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_agentflowId" ON "webhook_delivery" ("agentflowId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_agentflowId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_executionId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_webhookId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "webhook_delivery";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_enabled";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_agentflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "webhook";`)
    }
}
