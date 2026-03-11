import { MigrationInterface, QueryRunner } from 'typeorm'

export class ConsolidatedBaseline1800000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS chat_flow (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "flowData" text NOT NULL,
                deployed bool NULL,
                "isPublic" bool NULL,
                apikeyid varchar NULL,
                "chatbotConfig" text NULL,
                "apiConfig" text NULL,
                "analytic" text NULL,
                "speechToText" text NULL,
                "textToSpeech" text NULL,
                "followUpPrompts" text NULL,
                "category" text NULL,
                "type" VARCHAR(20) NOT NULL DEFAULT 'AGENTFLOW',
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3c7cea7d047ac4b91764574cdbf" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chatflow_name" ON "chat_flow" (substring("name" from 1 for 255));`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS chat_message (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "role" varchar NOT NULL,
                "chatflowid" uuid NOT NULL,
                "content" text NOT NULL,
                "sourceDocuments" text NULL,
                "usedTools" text NULL,
                "fileAnnotations" text NULL,
                "fileUploads" text NULL,
                "leadEmail" text NULL,
                "agentReasoning" text NULL,
                "action" text NULL,
                "artifacts" text NULL,
                "followUpPrompts" text NULL,
                "executionId" uuid NULL,
                "chatType" varchar NOT NULL DEFAULT 'INTERNAL',
                "chatId" varchar NOT NULL,
                "memoryType" varchar NULL,
                "sessionId" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_f56c36fe42894d57e5c664d229" ON "chat_message" ("chatflowid");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS credential (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "credentialName" varchar NOT NULL,
                "encryptedData" text NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3a5169bcd3d5463cefeec78be82" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS tool (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                description text NOT NULL,
                color varchar NOT NULL,
                "iconSrc" varchar NULL,
                "schema" text NULL,
                func text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3bf5b1016a384916073184f99b7" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS assistant (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "credential" uuid NOT NULL,
                "details" text NOT NULL,
                "type" text NULL,
                "iconSrc" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3c7cea7a044ac4c92764576cdbf" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS variable (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "value" text NOT NULL,
                "type" text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98419043dd704f54-9830ab78f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS chat_message_feedback (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowid" uuid NOT NULL,
                "content" text NULL,
                "chatId" varchar NOT NULL,
                "messageId" uuid NOT NULL,
                "rating" varchar NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98419043dd704f54-9830ab78f9" PRIMARY KEY (id),
                CONSTRAINT "UQ_6352078b5a294f2d22179ea7956" UNIQUE ("messageId")
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_f56c36fe42894d57e5c664d230" ON "chat_message_feedback" ("chatflowid");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_9acddcb7a2b51fe37669049fc6" ON "chat_message_feedback" ("chatId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS upsert_history (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowid" varchar NOT NULL,
                "result" text NOT NULL,
                "flowData" text NOT NULL,
                "date" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_37327b22b6e246319bd5eeb0e88" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS lead (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowid" varchar NOT NULL,
                "chatId" varchar NOT NULL,
                "name" text NULL,
                "email" text NULL,
                "phone" text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98419043dd704f54-9830ab78f0" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS document_store (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "description" varchar NULL,
                "loaders" text NULL,
                "whereUsed" text NULL,
                "status" varchar NOT NULL,
                "vectorStoreConfig" text NULL,
                "embeddingConfig" text NULL,
                "recordManagerConfig" text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98495043dd774f54-9830ab78f9" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS document_store_file_chunk (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "docId" uuid NOT NULL,
                "chunkNo" integer NOT NULL,
                "storeId" uuid NOT NULL,
                "pageContent" text NULL,
                "metadata" text NULL,
                CONSTRAINT "PK_90005043dd774f54-9830ab78f9" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e76bae1780b77e56aab1h2asd4" ON document_store_file_chunk ("docId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e213b811b01405a42309a6a410" ON document_store_file_chunk ("storeId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS evaluation (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "chatflowId" text NOT NULL,
                "chatflowName" text NOT NULL,
                "datasetId" varchar NOT NULL,
                "datasetName" varchar NOT NULL,
                "additionalConfig" text NULL,
                "evaluationType" varchar NOT NULL,
                "status" varchar NOT NULL,
                "average_metrics" text NULL,
                "runDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98989043dd804f54-9830ab99f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS evaluation_run (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "evaluationId" varchar NOT NULL,
                "input" text NOT NULL,
                "expectedOutput" text NULL,
                "actualOutput" text NULL,
                "evaluators" text NULL,
                "llmEvaluators" text NULL,
                "metrics" text NULL,
                "errors" text NULL DEFAULT '[]',
                "runDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98989927dd804f54-9840ab23f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS dataset (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "description" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98419043dd804f54-9830ab99f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS dataset_row (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "datasetId" varchar NOT NULL,
                "input" text NOT NULL,
                "output" text NULL,
                "sequence_no" integer DEFAULT -1,
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_98909027dd804f54-9840ab99f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS evaluator (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "type" text NULL,
                "config" text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_90019043dd804f54-9830ab11f8" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS apikey (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "apiKey" varchar NOT NULL,
                "apiSecret" varchar NOT NULL,
                "keyName" varchar NOT NULL,
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_96109043dd704f53-9830ab78f0" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS custom_template (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "flowData" text NOT NULL,
                "description" varchar NULL,
                "badge" varchar NULL,
                "framework" varchar NULL,
                "usecases" varchar NULL,
                "type" varchar NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3c7cea7d087ac4b91764574cdbf" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS execution (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "executionData" text NOT NULL,
                "action" text NULL,
                "state" varchar NOT NULL,
                "agentflowId" uuid NOT NULL,
                "sessionId" varchar NOT NULL,
                "isPublic" boolean NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "stoppedDate" timestamp NULL,
                CONSTRAINT "PK_936a419c3b8044598d72d95da61" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "user" (
                id varchar(36) NOT NULL,
                email varchar NOT NULL UNIQUE,
                password text NOT NULL,
                name varchar NULL,
                role varchar NOT NULL DEFAULT 'user',
                status varchar NOT NULL DEFAULT 'unverified',
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_id" PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "oauth_client" (
                id varchar(36) NOT NULL,
                "clientId" varchar NOT NULL UNIQUE,
                "clientSecret" text NOT NULL,
                "clientName" text NOT NULL,
                scopes text NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_oauth_client_id" PRIMARY KEY (id)
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "oauth_client"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "user"`)
        await queryRunner.query(`DROP TABLE IF EXISTS execution`)
        await queryRunner.query(`DROP TABLE IF EXISTS custom_template`)
        await queryRunner.query(`DROP TABLE IF EXISTS apikey`)
        await queryRunner.query(`DROP TABLE IF EXISTS evaluator`)
        await queryRunner.query(`DROP TABLE IF EXISTS dataset_row`)
        await queryRunner.query(`DROP TABLE IF EXISTS dataset`)
        await queryRunner.query(`DROP TABLE IF EXISTS evaluation_run`)
        await queryRunner.query(`DROP TABLE IF EXISTS evaluation`)
        await queryRunner.query(`DROP TABLE IF EXISTS document_store_file_chunk`)
        await queryRunner.query(`DROP TABLE IF EXISTS document_store`)
        await queryRunner.query(`DROP TABLE IF EXISTS lead`)
        await queryRunner.query(`DROP TABLE IF EXISTS upsert_history`)
        await queryRunner.query(`DROP TABLE IF EXISTS chat_message_feedback`)
        await queryRunner.query(`DROP TABLE IF EXISTS variable`)
        await queryRunner.query(`DROP TABLE IF EXISTS assistant`)
        await queryRunner.query(`DROP TABLE IF EXISTS tool`)
        await queryRunner.query(`DROP TABLE IF EXISTS credential`)
        await queryRunner.query(`DROP TABLE IF EXISTS chat_message`)
        await queryRunner.query(`DROP TABLE IF EXISTS chat_flow`)
    }
}
