import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: MCP server change log (sqlite).
 *
 * Mirrors the postgres migration. See its rationale block for why this
 * table exists; this file is just the sqlite-shape equivalent.
 */
export class CreateMCPServerChangeLog1800000000014 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "mcp_server_change_log" (
                "id" varchar PRIMARY KEY NOT NULL,
                "mcpServerId" varchar NOT NULL,
                "userId" varchar,
                "userEmail" varchar,
                "changeKind" varchar NOT NULL,
                "changedFields" text,
                "changeSummary" varchar NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_mcpServerId" ON "mcp_server_change_log" ("mcpServerId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_userId" ON "mcp_server_change_log" ("userId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_createdDate" ON "mcp_server_change_log" ("createdDate");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_server_created" ON "mcp_server_change_log" ("mcpServerId", "createdDate");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_server_created";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_createdDate";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_mcpServerId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "mcp_server_change_log";`)
    }
}
