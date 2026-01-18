# Chronos - Visual AI agent builder

[Chronos](https://github.com/popularowl/chronos) project is a fork of [Flowise](https://github.com/FlowiseAI/Flowise) - with the goal to maintain a lean visual AI agent builder tool, focused on the local and self hosted deployments. It provides:

- Visual drag-and-drop workflow builder for creating AI agent pipelines.
- Multiple deployment modes, including simple, worker queue, integrations with local vector databases and local LLM models.
- Horizontal scalability through Redis-based job queues (scale by increasing number of workers).
- 100+ LLM and embedding provider integrations.

## Summary
-   [Quick Starts](#quick-starts)
-   [Documentation](#documentation)
-   [Env Variables](#env-variables)
-   [License](#license)

## Quick Starts

Chronos is tailored for the local and self hosted deployments. Most convinient way to get started with the app is to use the provided example docker compose file.

Build and run a local Docker container image:

```bash
cd chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now accessable on http://localhost:3001
docker stop chronos
```

Use the local container image in [docker compose](https://docs.docker.com/compose/):

```bash
cd chronos_app/docker
docker compose up  # or docker compose up -d
docker compose ls
docker-compose down # or docker-compose down --volumes
# chronos is now accessable on http://localhost:3001
```

Worker mode with redis queues for horizontal scalability of agent request processing:

```bash
# run the docker compose which shows how to operate Chronos in queue / worker mode
docker compose -f docker-compose-workers.yml up 
# scale workers if needed
docker compose -f docker-compose-workers.yml up --scale chronos-worker=3
# if enable you will see BullMQ dashboard at http://localhost:3001/admin/queues

```

Vector database mode for document embeddings example:

```bash
# run with Qdrant vector database and Ollama container for local embeddings
docker compose -f docker-compose-vectordb.yml up
# use ollama container and pull the embedding model after startup
docker compose -f docker-compose-vectordb.yml exec ollama ollama pull nomic-embed-text
# chronos is now accessible on http://localhost:3001
# configure vector store in UI: qdrant running at http://qdrant:6333
# configure embeddings in UI: ollama running at http://ollama:11434
```

see more [detailed tutorial for this usecase](https://www.popularowl.com/chronos/vector-database-with-local-embedings/).





## Documentation

"How to" guides for Chronos project are maintained within series of [Chronos tutorials](https://www.popularowl.com/chronos/). Visit them for more details.  

## Env Variables

Chronos allows configuration via set of supported environment variables. See example [env variables](chronos_app/docker/.env.example).

## Support

We [provide professional services assistance](https://www.popularowl.com/about/) to deploy and run Chronos visual AI agent builder for your organization.

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).
