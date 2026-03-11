import { MigrationInterface, QueryRunner } from 'typeorm'

export class ConsolidatedBaseline1800000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`chat_flow\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`flowData\` LONGTEXT NOT NULL,
                \`deployed\` tinyint DEFAULT NULL,
                \`isPublic\` tinyint DEFAULT NULL,
                \`apikeyid\` varchar(255) DEFAULT NULL,
                \`chatbotConfig\` text DEFAULT NULL,
                \`apiConfig\` text DEFAULT NULL,
                \`analytic\` text DEFAULT NULL,
                \`speechToText\` text DEFAULT NULL,
                \`textToSpeech\` text DEFAULT NULL,
                \`followUpPrompts\` text DEFAULT NULL,
                \`category\` text DEFAULT NULL,
                \`type\` VARCHAR(20) NOT NULL DEFAULT 'AGENTFLOW',
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`CREATE INDEX \`IDX_chatflow_name\` ON \`chat_flow\` (\`name\`(191));`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`chat_message\` (
                \`id\` varchar(36) NOT NULL,
                \`role\` varchar(255) NOT NULL,
                \`chatflowid\` varchar(255) NOT NULL,
                \`content\` LONGTEXT NOT NULL,
                \`sourceDocuments\` text DEFAULT NULL,
                \`usedTools\` LONGTEXT DEFAULT NULL,
                \`fileAnnotations\` text DEFAULT NULL,
                \`fileUploads\` text DEFAULT NULL,
                \`leadEmail\` text DEFAULT NULL,
                \`agentReasoning\` LONGTEXT DEFAULT NULL,
                \`action\` LONGTEXT DEFAULT NULL,
                \`artifacts\` LONGTEXT DEFAULT NULL,
                \`followUpPrompts\` text DEFAULT NULL,
                \`executionId\` text DEFAULT NULL,
                \`chatType\` varchar(255) NOT NULL DEFAULT 'INTERNAL',
                \`chatId\` varchar(255) NOT NULL,
                \`memoryType\` varchar(255) DEFAULT NULL,
                \`sessionId\` varchar(255) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                KEY \`IDX_e574527322272fd838f4f0f3d3\` (\`chatflowid\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`credential\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`credentialName\` varchar(255) NOT NULL,
                \`encryptedData\` text NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`tool\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`description\` text NOT NULL,
                \`color\` varchar(255) NOT NULL,
                \`iconSrc\` varchar(255) DEFAULT NULL,
                \`schema\` text DEFAULT NULL,
                \`func\` text DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`assistant\` (
                \`id\` varchar(36) NOT NULL,
                \`credential\` varchar(255) NOT NULL,
                \`details\` text NOT NULL,
                \`type\` text DEFAULT NULL,
                \`iconSrc\` varchar(255) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`variable\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`value\` text NOT NULL,
                \`type\` varchar(255) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`chat_message_feedback\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowid\` varchar(255) NOT NULL,
                \`content\` text DEFAULT NULL,
                \`chatId\` varchar(255) NOT NULL,
                \`messageId\` varchar(255) NOT NULL,
                \`rating\` varchar(255) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`upsert_history\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowid\` varchar(255) NOT NULL,
                \`result\` text NOT NULL,
                \`flowData\` LONGTEXT NOT NULL,
                \`date\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                KEY \`IDX_a0b59fd66f6e48d2b198123cb6\` (\`chatflowid\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`lead\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowid\` varchar(255) NOT NULL,
                \`chatId\` varchar(255) NOT NULL,
                \`name\` text DEFAULT NULL,
                \`email\` text DEFAULT NULL,
                \`phone\` text DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`document_store\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`description\` varchar(255) DEFAULT NULL,
                \`loaders\` LONGTEXT DEFAULT NULL,
                \`whereUsed\` text DEFAULT NULL,
                \`status\` varchar(20) NOT NULL,
                \`vectorStoreConfig\` text DEFAULT NULL,
                \`embeddingConfig\` text DEFAULT NULL,
                \`recordManagerConfig\` text DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`document_store_file_chunk\` (
                \`id\` varchar(36) NOT NULL,
                \`docId\` varchar(36) NOT NULL,
                \`storeId\` varchar(36) NOT NULL,
                \`chunkNo\` INT NOT NULL,
                \`pageContent\` LONGTEXT NOT NULL,
                \`metadata\` LONGTEXT DEFAULT NULL,
                PRIMARY KEY (\`id\`),
                KEY \`IDX_e76bae1780b77e56aab1h2asd4\` (\`docId\`),
                KEY \`IDX_e213b811b01405a42309a6a410\` (\`storeId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`evaluation\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`chatflowId\` LONGTEXT NOT NULL,
                \`chatflowName\` varchar(255) NOT NULL,
                \`datasetId\` LONGTEXT NOT NULL,
                \`datasetName\` varchar(255) NOT NULL,
                \`additionalConfig\` LONGTEXT DEFAULT NULL,
                \`evaluationType\` varchar(20) NOT NULL,
                \`status\` varchar(10) NOT NULL,
                \`average_metrics\` LONGTEXT DEFAULT NULL,
                \`runDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`evaluation_run\` (
                \`id\` varchar(36) NOT NULL,
                \`evaluationId\` varchar(36) NOT NULL,
                \`input\` LONGTEXT DEFAULT NULL,
                \`expectedOutput\` LONGTEXT NOT NULL,
                \`actualOutput\` LONGTEXT NOT NULL,
                \`evaluators\` LONGTEXT DEFAULT NULL,
                \`llmEvaluators\` text DEFAULT NULL,
                \`metrics\` text DEFAULT NULL,
                \`errors\` LONGTEXT DEFAULT NULL,
                \`runDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`dataset\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`description\` varchar(255) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`dataset_row\` (
                \`id\` varchar(36) NOT NULL,
                \`datasetId\` varchar(36) NOT NULL,
                \`input\` LONGTEXT NOT NULL,
                \`output\` LONGTEXT DEFAULT NULL,
                \`sequence_no\` INT DEFAULT -1,
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`evaluator\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`type\` varchar(25) DEFAULT NULL,
                \`config\` LONGTEXT DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`apikey\` (
                \`id\` varchar(36) NOT NULL,
                \`apiKey\` varchar(255) NOT NULL,
                \`apiSecret\` varchar(255) NOT NULL,
                \`keyName\` varchar(255) NOT NULL,
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`custom_template\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`flowData\` text NOT NULL,
                \`description\` varchar(255) DEFAULT NULL,
                \`badge\` varchar(255) DEFAULT NULL,
                \`framework\` varchar(255) DEFAULT NULL,
                \`usecases\` varchar(255) DEFAULT NULL,
                \`type\` varchar(30) DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`execution\` (
                \`id\` varchar(36) NOT NULL,
                \`executionData\` LONGTEXT NOT NULL,
                \`action\` text DEFAULT NULL,
                \`state\` varchar(255) NOT NULL,
                \`agentflowId\` varchar(255) NOT NULL,
                \`sessionId\` varchar(255) NOT NULL,
                \`isPublic\` boolean DEFAULT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`stoppedDate\` datetime(6) DEFAULT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`user\` (
                id varchar(36) NOT NULL,
                email varchar(255) NOT NULL UNIQUE,
                password text NOT NULL,
                name varchar(255) DEFAULT NULL,
                role varchar(50) NOT NULL DEFAULT 'user',
                status varchar(50) NOT NULL DEFAULT 'unverified',
                createdDate timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedDate timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            );
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`oauth_client\` (
                id varchar(36) NOT NULL,
                clientId varchar(255) NOT NULL UNIQUE,
                clientSecret text NOT NULL,
                clientName text NOT NULL,
                scopes text DEFAULT NULL,
                createdDate timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedDate timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`oauth_client\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`user\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`execution\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`custom_template\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`apikey\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`evaluator\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`dataset_row\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`dataset\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`evaluation_run\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`evaluation\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`document_store_file_chunk\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`document_store\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`lead\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`upsert_history\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`chat_message_feedback\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`variable\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`assistant\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`tool\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`credential\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`chat_message\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`chat_flow\``)
    }
}
