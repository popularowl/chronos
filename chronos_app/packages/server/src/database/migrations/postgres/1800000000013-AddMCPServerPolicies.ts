import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: per-server reliability policies.
 *
 * Adds a nullable `policies` text column on `mcp_server` that stores the
 * JSON-stringified policy bag `{ retry, rateLimit, circuitBreaker }`. Each
 * top-level key is optional; absence = platform default resolved at the
 * service layer from `MCP_DEFAULT_RETRY_MAX_ATTEMPTS` etc. NULL is the
 * pre-v1.8 row state and means "use defaults across the board" — additive
 * migration, no behaviour change for existing servers.
 */
export class AddMCPServerPolicies1800000000013 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "policies" text NULL;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "policies";`)
    }
}
