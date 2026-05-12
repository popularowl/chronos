import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: policy outcome on tool-invocation audit rows (sqlite).
 *
 * Mirrors the postgres migration. See its rationale block for the enum
 * values and why NULL preserves pre-v1.8 rows.
 */
export class AddPolicyOutcomeToToolInvocationAudit1800000000015 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN "policyOutcome" varchar;`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_policyOutcome" ON "tool_invocation_audit" ("policyOutcome");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_policyOutcome";`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN "policyOutcome";`)
    }
}
