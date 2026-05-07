import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.7.0 — Persistent tool-invocation audit (Group A — sub-PR 3a).
 *
 * Adds a `tool_invocation_audit` table that captures every MCP tool call
 * brokered through the Chronos gateway. Promotes v1.6's structured
 * `logger.info({ event: 'mcp.tool.invoke' })` lines into queryable rows so
 * compliance / billing / debugging surfaces (3b query API, 3c UI viewer,
 * § 6 HTTP-agent execution viewer) don't depend on log-aggregator state.
 *
 * Writes are best-effort fire-and-forget at `auditService.recordToolInvocation`;
 * the gateway invoke path never fails on audit-write failure. Existing
 * structured logger lines remain as streaming / fallback records.
 *
 * No backfill — pre-v1.7 invocations only exist in process logs and aren't
 * replayable into the table.
 */
export class AddToolInvocationAudit1800000000010 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tool_invocation_audit" (
                "id" varchar PRIMARY KEY NOT NULL,
                "agentId" varchar NOT NULL,
                "agentSlug" varchar NOT NULL,
                "mcpServerId" varchar,
                "mcpServerSlug" varchar NOT NULL,
                "toolName" varchar NOT NULL,
                "namespacedTool" varchar NOT NULL,
                "success" boolean NOT NULL,
                "durationMs" integer NOT NULL DEFAULT 0,
                "errorMessage" text,
                "callId" varchar,
                "userId" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_agentId" ON "tool_invocation_audit" ("agentId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_mcpServerId" ON "tool_invocation_audit" ("mcpServerId");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_namespacedTool" ON "tool_invocation_audit" ("namespacedTool");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_success" ON "tool_invocation_audit" ("success");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_callId" ON "tool_invocation_audit" ("callId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_userId" ON "tool_invocation_audit" ("userId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_createdDate" ON "tool_invocation_audit" ("createdDate");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_agent_created" ON "tool_invocation_audit" ("agentId", "createdDate");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_agent_created";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_createdDate";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_callId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_success";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_namespacedTool";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_mcpServerId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_agentId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "tool_invocation_audit";`)
    }
}
