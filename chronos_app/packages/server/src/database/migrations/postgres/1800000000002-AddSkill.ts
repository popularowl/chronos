import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Create the skill table for storing skill definitions.
 */
export class AddSkill1800000000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS skill (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                description text NOT NULL,
                category varchar NOT NULL DEFAULT 'general',
                color varchar NOT NULL,
                "iconSrc" varchar NULL,
                content text NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_skill_id" PRIMARY KEY (id)
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill;`)
    }
}
