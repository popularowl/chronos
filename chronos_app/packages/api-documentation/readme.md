# Chronos API Documentation

A standalone microservice that serves interactive Swagger UI documentation for the Chronos REST API.

## Prerequisites

- Node.js v24+ (`nvm use 24`)
- pnpm = 10.13

## Setup

From the monorepo root (`chronos_app/`):

```bash
cd chronos_app
pnpm install
cd packages/api-documentation
pnpm build
pnpm start
## API spec server is now running on localhost:6655
```
The API documentation server starts on port **6655** by default.

- Click any endpoint to expand it and see request/response details, parameters, and schemas.
- Use the **"Try it out"** button on any endpoint to send live requests to the Chronos server directly from the browser.
- For authenticated endpoints, click the **"Authorize"** button at the top and enter your JWT Bearer token.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_DOCS_PORT` | `6655` | Port for the documentation server |
| `CHRONOS_API_URL` | `http://localhost:3001/api/v1` | Base URL of the Chronos API server |

Further details see the main [Readme](../../readme.md) for the project.
