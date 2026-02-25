import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRoleToUser1770000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'role'`
        )
        if (hasColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE "user" ADD COLUMN role varchar NOT NULL DEFAULT 'user'`)
            // Set existing users to admin (they are the instance owners)
            await queryRunner.query(`UPDATE "user" SET role = 'admin' WHERE role = 'user'`)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS role`)
    }
}
