import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRoleToUser1770000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.query(`PRAGMA table_info("user")`)
        const hasRole = table.some((col: any) => col.name === 'role')
        if (!hasRole) {
            await queryRunner.query(`ALTER TABLE "user" ADD COLUMN role varchar NOT NULL DEFAULT 'user'`)
            // Set existing users to admin (they are the instance owners)
            await queryRunner.query(`UPDATE "user" SET role = 'admin' WHERE role = 'user'`)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // SQLite does not support DROP COLUMN directly; this is a no-op
        await queryRunner.query(`SELECT 1`)
    }
}
