import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRoleToUser1770000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'user' AND COLUMN_NAME = 'role' AND TABLE_SCHEMA = DATABASE()`
        )
        if (hasColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE \`user\` ADD COLUMN role varchar(50) NOT NULL DEFAULT 'user'`)
            // Set existing users to admin (they are the instance owners)
            await queryRunner.query(`UPDATE \`user\` SET role = 'admin' WHERE role = 'user'`)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN role`)
    }
}
