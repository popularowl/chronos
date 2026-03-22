import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWebhooks1800000000003 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS webhook (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "url" varchar NOT NULL,
                "agentflowId" uuid NOT NULL,
                "events" text NOT NULL,
                "secret" varchar NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "maxRetries" int NOT NULL DEFAULT 3,
                "timeoutMs" int NOT NULL DEFAULT 10000,
                "userId" varchar(36) NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_webhook" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_agentflowId" ON webhook ("agentflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_enabled" ON webhook ("enabled");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS webhook_delivery (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "webhookId" uuid NOT NULL,
                "executionId" uuid NOT NULL,
                "agentflowId" uuid NOT NULL,
                "event" varchar NOT NULL,
                "payload" text NOT NULL,
                "statusCode" int NULL,
                "responseBody" text NULL,
                "attempt" int NOT NULL DEFAULT 1,
                "success" boolean NOT NULL DEFAULT false,
                "errorMessage" text NULL,
                "deliveredAt" timestamp NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_webhook_delivery" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_webhookId" ON webhook_delivery ("webhookId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_executionId" ON webhook_delivery ("executionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_agentflowId" ON webhook_delivery ("agentflowId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_agentflowId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_executionId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_delivery_webhookId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS webhook_delivery;`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_enabled";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_agentflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS webhook;`)
    }
}
