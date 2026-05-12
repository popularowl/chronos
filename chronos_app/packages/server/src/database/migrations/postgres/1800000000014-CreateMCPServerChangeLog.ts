import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: MCP server change log.
 *
 * Captures every mutation on an `mcp_server` row (create, update, delete,
 * enable / disable) attributed to the Chronos user who triggered it. Stores
 * a JSON `changedFields` diff plus a human-readable `changeSummary`. Secrets
 * (`outboundAuth.bearerToken`, `requestHeaders.*.value`, etc.) are redacted
 * to `***` at the service layer before the row is written — see
 * `services/mcp-server-change-log`.
 *
 * Surfaces on the new **History** tab of `MCPServerDetail` (Group A — UI
 * slice A2). Writes are fire-and-forget from `mcpServersService` so a log
 * failure can never block the underlying mutation.
 *
 * `userEmail` is a snapshot at the time of the change — the user row may be
 * deleted later. Indexed on `mcpServerId`, `userId`, `createdDate` to keep
 * the per-server History tab and the future cross-server audit view fast.
 */
export class CreateMCPServerChangeLog1800000000014 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS mcp_server_change_log (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "mcpServerId" uuid NOT NULL,
                "userId" varchar NULL,
                "userEmail" varchar NULL,
                "changeKind" varchar NOT NULL,
                "changedFields" text NULL,
                "changeSummary" varchar NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_mcp_server_change_log" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_mcpServerId" ON mcp_server_change_log ("mcpServerId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_userId" ON mcp_server_change_log ("userId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_createdDate" ON mcp_server_change_log ("createdDate");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_mcp_server_change_log_server_created" ON mcp_server_change_log ("mcpServerId", "createdDate" DESC);`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_server_created";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_createdDate";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_server_change_log_mcpServerId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS mcp_server_change_log;`)
    }
}
