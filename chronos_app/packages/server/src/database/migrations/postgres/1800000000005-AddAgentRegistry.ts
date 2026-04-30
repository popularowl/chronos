import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.6.0 — Agent Registry + HTTP Runtime.
 *
 * Adds an `agent` table shaped as a superset of the A2A Agent Card
 * (https://a2a-protocol.org/latest/specification/) plus Chronos-specific
 * runtime fields. Backfills one BUILT_IN agent row per existing agentflow so
 * the new Agents page lists everything immediately on upgrade. The v1.6.0
 * runtime only proxies HTTP agents; A2A-shape columns are populated lazily.
 */
export class AddAgentRegistry1800000000005 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS agent (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                name varchar NOT NULL,
                slug varchar NOT NULL,
                description text NULL,
                version varchar NOT NULL DEFAULT '1.0.0',
                "protocolVersion" varchar NULL,
                "iconUrl" varchar NULL,
                provider text NULL,
                "documentationUrl" varchar NULL,
                capabilities text NULL,
                skills text NULL,
                "defaultInputModes" text NULL,
                "defaultOutputModes" text NULL,
                "serviceEndpoint" varchar NULL,
                interfaces text NULL,
                "securitySchemes" text NULL,
                security text NULL,
                "runtimeType" varchar(20) NOT NULL DEFAULT 'BUILT_IN',
                status varchar(20) NOT NULL DEFAULT 'UNKNOWN',
                enabled boolean NOT NULL DEFAULT true,
                "runtimeConfig" text NULL,
                "outboundAuth" text NULL,
                "callbackToken" varchar NULL,
                "allowedTools" text NULL,
                "builtinAgentflowId" uuid NULL,
                "lastHealthCheckAt" timestamp NULL,
                "lastHealthError" text NULL,
                "userId" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_agent" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_slug" ON agent (slug);`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_runtimeType" ON agent ("runtimeType");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_enabled" ON agent (enabled);`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_builtinAgentflowId" ON agent ("builtinAgentflowId");`)

        // Backfill: one BUILT_IN agent row per existing agentflow.
        const existing: Array<{ id: string; name: string; userId: string | null }> = await queryRunner.query(
            `SELECT id, name, "userId" FROM agent_flow;`
        )

        const usedSlugs = new Set<string>()
        for (const row of existing) {
            const slug = makeSlug(row.name, row.id, usedSlugs)
            usedSlugs.add(slug)
            await queryRunner.query(
                `INSERT INTO agent
                    (name, slug, version, "runtimeType", status, enabled, "builtinAgentflowId", "userId")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                [row.name, slug, '1.0.0', 'BUILT_IN', 'UNKNOWN', true, row.id, row.userId]
            )
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_builtinAgentflowId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_enabled";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_runtimeType";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_slug";`)
        await queryRunner.query(`DROP TABLE IF EXISTS agent;`)
    }
}

const makeSlug = (name: string, id: string, taken: Set<string>): string => {
    const base =
        (name || 'agent')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'agent'
    const suffix = id.replace(/-/g, '').slice(0, 8)
    let slug = `${base}-${suffix}`
    let n = 1
    while (taken.has(slug)) {
        slug = `${base}-${suffix}-${n++}`
    }
    return slug
}
