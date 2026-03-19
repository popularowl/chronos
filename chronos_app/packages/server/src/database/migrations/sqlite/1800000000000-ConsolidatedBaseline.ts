import { MigrationInterface, QueryRunner } from 'typeorm'

export class ConsolidatedBaseline1800000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "agent_flow" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "flowData" text NOT NULL,
                "deployed" boolean,
                "isPublic" boolean,
                "apikeyid" varchar,
                "chatbotConfig" text,
                "apiConfig" text,
                "analytic" text,
                "speechToText" text,
                "textToSpeech" text,
                "followUpPrompts" text,
                "category" text,
                "type" VARCHAR(20) NOT NULL DEFAULT 'AGENTFLOW',
                "userId" varchar(36),
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agentflow_name" ON "agent_flow" (substr(name, 1, 255));`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agentflow_userId" ON "agent_flow" ("userId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "chat_message" (
                "id" varchar PRIMARY KEY NOT NULL,
                "role" varchar NOT NULL,
                "agentflowid" varchar NOT NULL,
                "content" text NOT NULL,
                "sourceDocuments" text,
                "usedTools" text,
                "fileAnnotations" text,
                "fileUploads" text,
                "leadEmail" text,
                "agentReasoning" text,
                "action" text,
                "artifacts" text,
                "followUpPrompts" text,
                "executionId" varchar,
                "chatType" VARCHAR NOT NULL DEFAULT 'INTERNAL',
                "chatId" VARCHAR NOT NULL,
                "memoryType" VARCHAR,
                "sessionId" VARCHAR,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e574527322272fd838f4f0f3d3" ON "chat_message" ("agentflowid");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "credential" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "credentialName" varchar NOT NULL,
                "encryptedData" text NOT NULL,
                "userId" varchar(36),
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_credential_userId" ON "credential" ("userId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tool" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "description" text NOT NULL,
                "color" varchar NOT NULL,
                "iconSrc" varchar,
                "schema" text,
                "func" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "assistant" (
                "id" varchar PRIMARY KEY NOT NULL,
                "credential" varchar NOT NULL,
                "details" text NOT NULL,
                "type" text,
                "iconSrc" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "variable" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" text NOT NULL,
                "value" text NOT NULL,
                "type" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "chat_message_feedback" (
                "id" varchar PRIMARY KEY NOT NULL,
                "agentflowid" varchar NOT NULL,
                "chatId" varchar NOT NULL,
                "messageId" varchar NOT NULL,
                "rating" varchar NOT NULL,
                "content" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "upsert_history" (
                "id" varchar PRIMARY KEY NOT NULL,
                "agentflowid" varchar NOT NULL,
                "result" text NOT NULL,
                "flowData" text NOT NULL,
                "date" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "lead" (
                "id" varchar PRIMARY KEY NOT NULL,
                "agentflowid" varchar NOT NULL,
                "chatId" varchar NOT NULL,
                "name" text,
                "email" text,
                "phone" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_store" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "description" varchar,
                "status" varchar NOT NULL,
                "loaders" text,
                "whereUsed" text,
                "vectorStoreConfig" text,
                "embeddingConfig" text,
                "recordManagerConfig" text,
                "userId" varchar(36),
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_store_userId" ON "document_store" ("userId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_store_file_chunk" (
                "id" varchar PRIMARY KEY NOT NULL,
                "docId" varchar NOT NULL,
                "storeId" varchar NOT NULL,
                "chunkNo" INTEGER NOT NULL,
                "pageContent" text,
                "metadata" text
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e76bae1780b77e56aab1h2asd4" ON "document_store_file_chunk" ("docId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e213b811b01405a42309a6a410" ON "document_store_file_chunk" ("storeId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "evaluation" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "agentflowId" text NOT NULL,
                "agentflowName" text NOT NULL,
                "datasetId" varchar NOT NULL,
                "datasetName" varchar NOT NULL,
                "additionalConfig" text,
                "status" varchar NOT NULL,
                "evaluationType" varchar,
                "average_metrics" text,
                "runDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "evaluation_run" (
                "id" varchar PRIMARY KEY NOT NULL,
                "evaluationId" text NOT NULL,
                "input" text NOT NULL,
                "expectedOutput" text NOT NULL,
                "actualOutput" text NOT NULL,
                "evaluators" text,
                "llmEvaluators" text,
                "metrics" text,
                "errors" text DEFAULT '[]',
                "runDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "dataset" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" text NOT NULL,
                "description" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "dataset_row" (
                "id" varchar PRIMARY KEY NOT NULL,
                "datasetId" text NOT NULL,
                "input" text NOT NULL,
                "output" text NOT NULL,
                "sequence_no" integer DEFAULT -1,
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "evaluator" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" text NOT NULL,
                "type" varchar,
                "config" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "apikey" (
                "id" varchar PRIMARY KEY NOT NULL,
                "apiKey" varchar NOT NULL,
                "apiSecret" varchar NOT NULL,
                "keyName" varchar NOT NULL,
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "custom_template" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "flowData" text NOT NULL,
                "description" varchar,
                "badge" varchar,
                "framework" varchar,
                "usecases" varchar,
                "type" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "execution" (
                "id" varchar PRIMARY KEY NOT NULL,
                "executionData" text NOT NULL,
                "action" text,
                "state" varchar NOT NULL,
                "agentflowId" varchar NOT NULL,
                "sessionId" varchar NOT NULL,
                "isPublic" boolean,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')),
                "stoppedDate" datetime
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "user" (
                id varchar(36) NOT NULL PRIMARY KEY,
                email varchar NOT NULL UNIQUE,
                password text NOT NULL,
                name varchar,
                role varchar NOT NULL DEFAULT 'user',
                status varchar NOT NULL DEFAULT 'unverified',
                createdDate datetime NOT NULL DEFAULT (datetime('now')),
                updatedDate datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "oauth_client" (
                id varchar(36) NOT NULL PRIMARY KEY,
                "clientId" varchar NOT NULL UNIQUE,
                "clientSecret" text NOT NULL,
                "clientName" text NOT NULL,
                scopes text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)

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
        await queryRunner.query(`DROP TABLE IF EXISTS "skill"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "oauth_client"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "user"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "execution"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "custom_template"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "apikey"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "evaluator"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "dataset_row"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "dataset"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "evaluation_run"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "evaluation"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "document_store_file_chunk"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "document_store"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "lead"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "upsert_history"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "chat_message_feedback"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "variable"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "assistant"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "tool"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "credential"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "chat_message"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "agent_flow"`)
    }
}
