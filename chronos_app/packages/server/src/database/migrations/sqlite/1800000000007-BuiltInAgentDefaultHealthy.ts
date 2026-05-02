import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.6.0 follow-up — flip backfilled BUILT_IN agents from UNKNOWN to HEALTHY.
 *
 * BUILT_IN agents run in-process: they're alive iff Chronos is alive. The
 * health poller skips them, so anything seeded as UNKNOWN stays UNKNOWN
 * forever, leaving the /agents UI showing a misleading status chip. This
 * migration rewrites the structurally-known state. HTTP agents are
 * untouched — UNKNOWN is the correct pending-first-probe state for them.
 */
export class BuiltInAgentDefaultHealthy1800000000007 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "agent" SET "status" = 'HEALTHY' WHERE "runtimeType" = 'BUILT_IN' AND "status" = 'UNKNOWN';`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Only revert rows that were flipped by this migration — i.e. BUILT_IN
        // agents whose status is HEALTHY but never had a probe (lastHealthCheckAt IS NULL).
        await queryRunner.query(
            `UPDATE "agent" SET "status" = 'UNKNOWN' WHERE "runtimeType" = 'BUILT_IN' AND "status" = 'HEALTHY' AND "lastHealthCheckAt" IS NULL;`
        )
    }
}
