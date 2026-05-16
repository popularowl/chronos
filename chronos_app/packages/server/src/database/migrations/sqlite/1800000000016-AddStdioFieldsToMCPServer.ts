import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0: stdio transport support (sqlite).
 *
 * Mirrors the postgres migration. Adds nullable `args` + `env` text columns
 * on `mcp_server`. Both carry JSON-stringified payloads parsed at the
 * service layer. NULL = pre-v1.8 row, no behaviour change.
 */
export class AddStdioFieldsToMCPServer1800000000016 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN "args" text;`)
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN "env" text;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // sqlite ALTER TABLE DROP COLUMN is supported on 3.35+; matches the
        // posture used by other v1.8 migrations.
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN "env";`)
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN "args";`)
    }
}
