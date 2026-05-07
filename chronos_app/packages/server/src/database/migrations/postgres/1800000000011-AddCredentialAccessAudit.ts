import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.7.0 — Credential-access audit (Group A — sub-PR 3d).
 *
 * See the matching sqlite migration for the full rationale; this is the
 * postgres-shape equivalent.
 */
export class AddCredentialAccessAudit1800000000011 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS credential_access_audit (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "credentialId" uuid NOT NULL,
                "userId" varchar NULL,
                "agentId" uuid NULL,
                "source" varchar NOT NULL,
                "requestPath" varchar NULL,
                "success" boolean NOT NULL,
                "errorMessage" text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_credential_access_audit" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_credentialId" ON credential_access_audit ("credentialId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_userId" ON credential_access_audit ("userId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_agentId" ON credential_access_audit ("agentId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_source" ON credential_access_audit ("source");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_success" ON credential_access_audit ("success");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_credential_access_audit_createdDate" ON credential_access_audit ("createdDate");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_createdDate";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_success";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_source";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_agentId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_access_audit_credentialId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS credential_access_audit;`)
    }
}
