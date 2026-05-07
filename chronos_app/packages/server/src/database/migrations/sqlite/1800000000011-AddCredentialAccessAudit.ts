import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.7.0 — Credential-access audit (Group A — sub-PR 3d).
 *
 * Adds a `credential_access_audit` table that captures every server-side
 * `decryptCredentialData` call. SOC 2 evidence pattern.
 *
 * Sibling to `tool_invocation_audit` (3a) — kept separate because the primary
 * axis is `credentialId` and the surrounding column set differs.
 *
 * Coverage gap: components-side `getCredentialData` (tool-node path) NOT
 * instrumented in 3d-MVP. Tracked under v1.7 § 4 carve-outs.
 */
export class AddCredentialAccessAudit1800000000011 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "credential_access_audit" (
                "id" varchar PRIMARY KEY NOT NULL,
                "credentialId" varchar NOT NULL,
                "userId" varchar,
                "agentId" varchar,
                "source" varchar NOT NULL,
                "requestPath" varchar,
                "success" boolean NOT NULL,
                "errorMessage" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_credentialId" ON "credential_access_audit" ("credentialId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_userId" ON "credential_access_audit" ("userId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_agentId" ON "credential_access_audit" ("agentId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_source" ON "credential_access_audit" ("source");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_success" ON "credential_access_audit" ("success");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_createdDate" ON "credential_access_audit" ("createdDate");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_createdDate";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_success";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_source";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_agentId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_credentialId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "credential_access_audit";`)
    }
}
