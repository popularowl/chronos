import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: per-server reliability policies (sqlite).
 *
 * Mirrors the postgres migration. Adds a nullable `policies` text column on
 * `mcp_server`. NULL = use platform defaults; the service layer reads env
 * vars (`MCP_DEFAULT_RETRY_MAX_ATTEMPTS`, `MCP_DEFAULT_RATE_LIMIT_RPS`) to
 * fill in absent fields per-call.
 */
export class AddMCPServerPolicies1800000000013 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN "policies" text;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // sqlite ALTER TABLE DROP COLUMN is supported on 3.35+; matches the
        // posture used by other v1.8 migrations.
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN "policies";`)
    }
}
