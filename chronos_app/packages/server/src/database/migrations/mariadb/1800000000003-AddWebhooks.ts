import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWebhooks1800000000003 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`webhook\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`url\` varchar(2048) NOT NULL,
                \`agentflowId\` varchar(36) NOT NULL,
                \`events\` text NOT NULL,
                \`secret\` varchar(255) DEFAULT NULL,
                \`enabled\` tinyint NOT NULL DEFAULT 1,
                \`maxRetries\` int NOT NULL DEFAULT 3,
                \`timeoutMs\` int NOT NULL DEFAULT 10000,
                \`userId\` varchar(36) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE INDEX \`IDX_webhook_agentflowId\` ON \`webhook\` (\`agentflowId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_webhook_enabled\` ON \`webhook\` (\`enabled\`);`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`webhook_delivery\` (
                \`id\` varchar(36) NOT NULL,
                \`webhookId\` varchar(36) NOT NULL,
                \`executionId\` varchar(36) NOT NULL,
                \`agentflowId\` varchar(36) NOT NULL,
                \`event\` varchar(255) NOT NULL,
                \`payload\` text NOT NULL,
                \`statusCode\` int DEFAULT NULL,
                \`responseBody\` text DEFAULT NULL,
                \`attempt\` int NOT NULL DEFAULT 1,
                \`success\` tinyint NOT NULL DEFAULT 0,
                \`errorMessage\` text DEFAULT NULL,
                \`deliveredAt\` datetime(6) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE INDEX \`IDX_webhook_delivery_webhookId\` ON \`webhook_delivery\` (\`webhookId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_webhook_delivery_executionId\` ON \`webhook_delivery\` (\`executionId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_webhook_delivery_agentflowId\` ON \`webhook_delivery\` (\`agentflowId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_webhook_delivery_agentflowId\` ON \`webhook_delivery\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_webhook_delivery_executionId\` ON \`webhook_delivery\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_webhook_delivery_webhookId\` ON \`webhook_delivery\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`webhook_delivery\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_webhook_enabled\` ON \`webhook\`;`)
        await queryRunner.query(`DROP INDEX \`IDX_webhook_agentflowId\` ON \`webhook\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`webhook\`;`)
    }
}
