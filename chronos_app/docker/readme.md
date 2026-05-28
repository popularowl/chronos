# Chronos Docker

This directory hosts the Dockerfiles, compose files, and supporting code for running Chronos in containers.

## Quickstart — demo stack (recommended)

The fastest way to evaluate Chronos. This compose will start Chronos and Postgres containers, then a simple seeder registers two MCP servers (Memory + Fetch) and visual agentflow with preset OpenRouter credentials

```bash
cd chronos/chronos_app/docker
docker build -f Dockerfile.demo -t chronos:demo ..

export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_LLM_MODEL=openai/gpt-4o-mini \

docker compose -f docker-compose.demo.yml up
# chronos is now accessible on http://localhost:3001
# login: admin@admin.com / test1234
```

After compose starts you get:

-   An **OpenRouter** credential the canvas can attach to any Chat node.
-   Two **MCP servers** registered as stdio (Memory via `npx`, Fetch via `uvx`). Both should reach `HEALTHY` within a few seconds.
-   Logged seeder output confirms `+N created` / `N skipped` per category.

The seeder is idempotent: re-running `docker compose -f docker-compose.demo.yml up` will not duplicate records or overwrite manual edits made in the UI. The `Dockerfile.demo` image extends `Dockerfile.local` with `uv` so the Python-based fetch MCP preset works out of the box; production Chronos images stay lean.

## Other deployment paths

_Build and run Chronos locally, without Docker container images. Uses local Nodejs runtime enviroenment:_

```bash
# nodejs runtime v24 is required. use nvm if necesary
# make sure you are in /chronos_app directory
git clone git@github.com:intelligexhq/chronos.git
cd chronos/chronos_app
node -v
pnpm install # pnpm nuke && pnpm install --frozen-lockfile
pnpm build # pnpm build --force
rm -rf ~/.chronos # chronos dev data stores. see https://intelligex.com/chronos/how-chronos-agent-builder-stores-data
# export ENABLE_AGENTS=true && export ENABLE_MCP_SERVERS=true
pnpm dev
# chronos is accessible on localhost:3000
```

_Build and run a local Docker container image:_

```bash
# clone & go to docker directory
git clone git@github.com:intelligexhq/chronos.git
cd chronos/chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
docker run -d --name chronos -p 3001:3000 chronos:local
# docker run --name chronos2 -p 3003:3000 -e CHRONOS_INITIAL_USER=admin@admin.com:test1234:admin chronos:local
# docker run --name chronos2 -p 3003:3000 -e ENABLE_SCHEDULES=true -e CHRONOS_INITIAL_USER=admin@admin.com:test1234:admin chronos:local
# chronos is now accessable on http://localhost:3001
```

_Use the local container image in [docker compose](https://docs.docker.com/compose/):_

```bash
docker compose -f docker-compose.yml up  # or docker compose -f docker-compose.yml up -d
# docker build -f Dockerfile.local -t chronos:local .. && docker compose -f docker-compose.yml up
# docker build -f Dockerfile.local -t chronos:local .. && docker compose -f docker-compose-vectordb.yml up
# docker build -f Dockerfile.local -t chronos:local .. && docker compose -f docker-compose-schedules.yml up
# docker build -f Dockerfile.local -t chronos:local .. && docker compose -f docker-compose-opentelemetry.yml up
docker compose ls
docker-compose down # or docker-compose down --volumes
# chronos is now accessable on http://localhost:3001
```

_Worker mode with redis queues for horizontal scalability of agent request processing:_

```bash
# run the docker compose which shows how to operate Chronos in queue / worker mode
docker compose -f docker-compose-workers.yml up
# scale workers if needed
docker compose -f docker-compose-workers.yml up --scale chronos-worker=3
# if enable you will see BullMQ dashboard at http://localhost:3001/admin/queues
```

_Vector database mode for document embeddings example:_

```bash
# run with Qdrant vector database and Ollama container for local embeddings
docker compose -f docker-compose-vectordb.yml up
# use ollama container and pull the embedding model after startup
docker compose -f docker-compose-vectordb.yml exec ollama ollama pull nomic-embed-text

# chronos is now accessible on http://localhost:3001
# configure vector store in UI: qdrant running at http://qdrant:6333
# configure embeddings in UI: ollama running at http://ollama:11434
```

## Env Variables

To supply data to Chronos app during the startup you can use the following enviroenment variables - see [.env.example](.env.example)

## Compose files at a glance

| File                                                                     | Purpose                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [`docker-compose.demo.yml`](./docker-compose.demo.yml)                   | Recommended first run — seeded demo stack                      |
| [`docker-compose.yml`](./docker-compose.yml)                             | Basic single-service deployment                                |
| [`docker-compose.walkthrough.yml`](./docker-compose.walkthrough.yml)     | Manual agent-registry walkthrough (see `references/readme.md`) |
| [`docker-compose.smoke.yml`](./docker-compose.smoke.yml)                 | Internal smoke test (CI / regression)                          |
| [`docker-compose-workers.yml`](./docker-compose-workers.yml)             | Horizontal-scale workers + Redis queues                        |
| [`docker-compose-vectordb.yml`](./docker-compose-vectordb.yml)           | Qdrant + Ollama for embeddings                                 |
| [`docker-compose-schedules.yml`](./docker-compose-schedules.yml)         | Scheduled-agent deployment                                     |
| [`docker-compose-opentelemetry.yml`](./docker-compose-opentelemetry.yml) | OTel + Jaeger observability stack                              |

## Need assistance?

We provide [professional services](https://intelligex.com/about) to help you deploy, customise, and operate Chronos in your organisation’s environment:

-   Architecture and deployment in your infra (on‑prem or cloud).
-   Custom agent development, integrations of existing agents.
-   MCP catalogues, discovery, auditing and security
-   Training and best practices for teams.
