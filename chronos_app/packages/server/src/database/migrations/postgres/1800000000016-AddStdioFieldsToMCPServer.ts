import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.8.0: stdio transport support.
 *
 * Adds two nullable text columns on `mcp_server`:
 *  - `args` — JSON-stringified array of argv strings passed to
 *    `child_process.spawn`. Strings may carry `{{credentialId:field}}`
 *    interpolation tokens resolved at spawn time.
 *  - `env` — JSON-stringified `Record<string, string | { credentialId, field }>`
 *    merged into the spawn-time env. Object values are credential refs
 *    decrypted at spawn time; inline strings pass through verbatim.
 *
 * The base `mcp_server` table (migration 1800000000006) already declared
 * `command` and a nullable `url`, so this migration is purely additive.
 * NULL values keep pre-v1.8 rows behaviourally identical.
 */
export class AddStdioFieldsToMCPServer1800000000016 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "args" text NULL;`)
        await queryRunner.query(`ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "env" text NULL;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "env";`)
        await queryRunner.query(`ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "args";`)
    }
}
