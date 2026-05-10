import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * v1.7 — Rename `agent.callbackToken` → `agent.mcpGatewayToken`.
 *
 * The token authenticates a registered HTTP agent against the MCP gateway's
 * agent-facing endpoint (`POST/GET/DELETE /api/v1/mcp-gateway/:id`, Streamable
 * HTTP transport). The old "callback token" name didn't say what the callback
 * was for; renaming aligns the column with the gateway path, env var
 * (`MCP_GATEWAY_TOKEN`), and UI label ("MCP Gateway Token"). SQLite ≥3.25
 * supports `RENAME COLUMN` directly (TypeORM ships ≥3.30), so no table
 * rebuild is needed.
 */
export class RenameCallbackTokenToMcpGatewayToken1800000000012 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent" RENAME COLUMN "callbackToken" TO "mcpGatewayToken";`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent" RENAME COLUMN "mcpGatewayToken" TO "callbackToken";`)
    }
}
