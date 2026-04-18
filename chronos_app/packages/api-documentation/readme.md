# Chronos API Documentation

A standalone microservice that serves interactive Swagger UI documentation for the Chronos REST API. Built with Express, swagger-jsdoc, and swagger-ui-express, it generates an OpenAPI 3.0.3 specification from a hand-written YAML file and serves it via Swagger UI for browsing and testing endpoints.

## Prerequisites

- Node.js v24+ (`nvm use 24`)
- pnpm >= 10
- The Chronos server running (default: `http://localhost:3001`)

## Setup

From the monorepo root (`chronos_app/`):

```bash
pnpm install
```

## Starting the Server

### Option 1: Build and run

```bash
cd packages/api-documentation
pnpm build
pnpm start
```

### Option 2: From monorepo root

```bash
pnpm build
cd packages/api-documentation
pnpm start
```

The API documentation server starts on port **6655** by default.

## Navigating the API Docs

1. Open your browser and go to: **http://localhost:6655/api-docs**
   (Visiting http://localhost:6655/ will redirect you there automatically)

2. The Swagger UI interface displays all documented API endpoints grouped by tag:
   - **agentflows** - CRUD operations for AI agent workflows
   - **attachments** - File attachment uploads
   - **chatmessage** - Chat message history and management
   - **document-store** - Knowledge base and document management
   - **feedback** - User feedback on AI responses
   - **leads** - Lead capture from conversations
   - **ping** - Server health check
   - **prediction** - Send messages and get AI responses
   - **tools** - Custom tool definitions
   - **upsert-history** - Document processing history
   - **variables** - Flow variable management
   - **vector** - Vector embedding operations

3. Click any endpoint to expand it and see request/response details, parameters, and schemas.

4. Use the **"Try it out"** button on any endpoint to send live requests to the Chronos server directly from the browser.

5. For authenticated endpoints, click the **"Authorize"** button at the top and enter your JWT Bearer token.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_DOCS_PORT` | `6655` | Port for the documentation server |
| `CHRONOS_API_URL` | `http://localhost:3001/api/v1` | Base URL of the Chronos API server |

## Project Structure

```
api-documentation/
├── src/
│   ├── index.ts                 # Express server entry point
│   ├── configs/
│   │   └── swagger.config.ts    # OpenAPI/Swagger configuration
│   └── yml/
│       └── swagger.yml          # OpenAPI 3.0.3 specification
├── package.json
└── tsconfig.json
```

Further details see the main [Readme](../../readme.md) for the project.
