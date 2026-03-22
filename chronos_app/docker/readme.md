# Chronos Docker examples

This directory hosts Dockerfile.local with instructions to building container image. And multiple docker compose examples for Chronos local deployment options.

*Build and run Chronos locally, without Docker container images. Uses local Nodejs runtime enviroenment:*

```bash
# nodejs runtime v24 is required. use nvm if necesary
# make sure you are in /chronos_app directory
git clone git@github.com:intelligexhq/chronos.git
cd chronos/chronos_app
node -v
pnpm install # pnpm nuke && pnpm install --frozen-lockfile
pnpm build # pnpm build --force
pnpm dev
# chronos is accessible on localhost:3000
```

*Build and run a local Docker container image:*

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

*Use the local container image in [docker compose](https://docs.docker.com/compose/):*

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

*Worker mode with redis queues for horizontal scalability of agent request processing:*

```bash
# run the docker compose which shows how to operate Chronos in queue / worker mode
docker compose -f docker-compose-workers.yml up 
# scale workers if needed
docker compose -f docker-compose-workers.yml up --scale chronos-worker=3
# if enable you will see BullMQ dashboard at http://localhost:3001/admin/queues

```

*Vector database mode for document embeddings example:*

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

To persista the data, or supply data to Chronos app you can use the following enviroenment variables. For more options see [.env.example](.env.example)

## Examples

List of examples:

- [single service deployment](./docker-compose.yml)
- [multiple worker example](./docker-compose-workers.yml)
- [vector embeddings with self hosted models](./docker-compose-vectordb.yml)

## Need assistance?

We provide [professional services](https://intelligex.com/about) to help you deploy, customise, and operate Chronos in your organisation’s environment:
- Architecture and deployment in your infra (on‑prem or cloud).
- Custom agent development and integrations.
- Training and best practices for teams.
