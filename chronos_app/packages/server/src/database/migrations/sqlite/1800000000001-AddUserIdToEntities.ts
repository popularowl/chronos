import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add userId column to chat_flow, credential, and document_store tables.
 * Backfills existing rows with the first admin user's ID.
 */
export class AddUserIdToEntities1800000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_flow" ADD COLUMN "userId" varchar(36);`)
        await queryRunner.query(`ALTER TABLE "credential" ADD COLUMN "userId" varchar(36);`)
        await queryRunner.query(`ALTER TABLE "document_store" ADD COLUMN "userId" varchar(36);`)

        // Backfill: assign all existing data to the first admin user
        await queryRunner.query(
            `UPDATE "chat_flow" SET "userId" = (SELECT "id" FROM "user" WHERE "role" = 'admin' ORDER BY "createdDate" ASC LIMIT 1) WHERE "userId" IS NULL;`
        )
        await queryRunner.query(
            `UPDATE "credential" SET "userId" = (SELECT "id" FROM "user" WHERE "role" = 'admin' ORDER BY "createdDate" ASC LIMIT 1) WHERE "userId" IS NULL;`
        )
        await queryRunner.query(
            `UPDATE "document_store" SET "userId" = (SELECT "id" FROM "user" WHERE "role" = 'admin' ORDER BY "createdDate" ASC LIMIT 1) WHERE "userId" IS NULL;`
        )

        // Indexes
        await queryRunner.query(`CREATE INDEX "IDX_chatflow_userId" ON "chat_flow" ("userId");`)
        await queryRunner.query(`CREATE INDEX "IDX_credential_userId" ON "credential" ("userId");`)
        await queryRunner.query(`CREATE INDEX "IDX_document_store_userId" ON "document_store" ("userId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // SQLite does not support DROP COLUMN directly; recreating tables would be needed.
        // For simplicity, drop the indexes only.
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chatflow_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credential_userId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_store_userId";`)
    }
}
