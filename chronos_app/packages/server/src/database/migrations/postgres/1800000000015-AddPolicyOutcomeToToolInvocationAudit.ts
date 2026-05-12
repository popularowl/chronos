import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0 — Group A: policy outcome on tool-invocation audit rows.
 *
 * Adds a nullable `policyOutcome` column to `tool_invocation_audit` carrying
 * the reliability-policy verdict for the call:
 *   - `PASSED`        — the call ran without any policy intervention
 *   - `RATE_LIMITED`  — the rate-limit gate rejected the call before it ran
 *   - `RETRIED`       — the retry policy fired at least once (and the call
 *                       eventually succeeded or definitively failed)
 *   - `CIRCUIT_OPEN`  — the circuit-breaker rejected the call
 *
 * NULL preserves the pre-v1.8 row state for the historical rows already in
 * the table — they were never evaluated against a policy chain.
 */
export class AddPolicyOutcomeToToolInvocationAudit1800000000015 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN IF NOT EXISTS "policyOutcome" varchar NULL;`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_tool_invocation_audit_policyOutcome" ON "tool_invocation_audit" ("policyOutcome");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tool_invocation_audit_policyOutcome";`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN IF EXISTS "policyOutcome";`)
    }
}
