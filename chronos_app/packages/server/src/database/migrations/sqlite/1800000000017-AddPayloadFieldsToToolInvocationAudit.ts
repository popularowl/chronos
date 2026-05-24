import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Capture MCP request/response payloads in the audit log (sqlite).
 *
 * Mirrors the postgres migration. Adds nullable `requestPayload` +
 * `responsePayload` text columns. JSON.stringified at the entity-layer
 * transformer, parsed back on read. Gated at the gateway by the
 * `AUDIT_FULL_PAYLOADS` env var (default off). NULL on every row when
 * disabled.
 */
export class AddPayloadFieldsToToolInvocationAudit1800000000017 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN "requestPayload" text;`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN "responsePayload" text;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // sqlite ALTER TABLE DROP COLUMN is supported on 3.35+; matches the
        // posture used by other v1.8 migrations.
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN "responsePayload";`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN "requestPayload";`)
    }
}
