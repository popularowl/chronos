import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Create the skill table for storing skill definitions.
 */
export class AddSkill1800000000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "skill" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "description" text NOT NULL,
                "category" varchar NOT NULL DEFAULT 'general',
                "color" varchar NOT NULL,
                "iconSrc" varchar,
                "content" text NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill";`)
    }
}
