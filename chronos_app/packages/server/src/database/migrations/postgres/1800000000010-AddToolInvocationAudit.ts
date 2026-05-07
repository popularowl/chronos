import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.7.0 — Persistent tool-invocation audit (Group A — sub-PR 3a).
 *
 * See the matching sqlite migration for the full rationale; this is the
 * postgres-shape equivalent.
 */
export class AddToolInvocationAudit1800000000010 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS tool_invocation_audit (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "agentId" uuid NOT NULL,
                "agentSlug" varchar NOT NULL,
                "mcpServerId" uuid NULL,
                "mcpServerSlug" varchar NOT NULL,
                "toolName" varchar NOT NULL,
                "namespacedTool" varchar NOT NULL,
                "success" boolean NOT NULL,
                "durationMs" integer NOT NULL DEFAULT 0,
                "errorMessage" text NULL,
                "callId" varchar NULL,
                "userId" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_tool_invocation_audit" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_agentId" ON tool_invocation_audit ("agentId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_mcpServerId" ON tool_invocation_audit ("mcpServerId");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_namespacedTool" ON tool_invocation_audit ("namespacedTool");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_success" ON tool_invocation_audit ("success");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_callId" ON tool_invocation_audit ("callId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_userId" ON tool_invocation_audit ("userId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_createdDate" ON tool_invocation_audit ("createdDate");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_agent_created" ON tool_invocation_audit ("agentId", "createdDate" DESC);`
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
        await queryRunner.query(`DROP TABLE IF EXISTS tool_invocation_audit;`)
    }
}
