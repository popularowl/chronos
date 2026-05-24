import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Capture MCP request/response payloads in the audit log.
 *
 * Adds two nullable text columns on `tool_invocation_audit`:
 *  - `requestPayload`  — JSON-stringified MCP `tools/call` `arguments`
 *    object as seen at the gateway invoke site.
 *  - `responsePayload` — JSON-stringified MCP `tools/call` result object
 *    as returned by the upstream server (null on the error path; the
 *    existing `errorMessage` column carries failure shape).
 *
 */
export class AddPayloadFieldsToToolInvocationAudit1800000000017 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN IF NOT EXISTS "requestPayload" text NULL;`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" ADD COLUMN IF NOT EXISTS "responsePayload" text NULL;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN IF EXISTS "responsePayload";`)
        await queryRunner.query(`ALTER TABLE "tool_invocation_audit" DROP COLUMN IF EXISTS "requestPayload";`)
    }
}
