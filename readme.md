# Chronos - Visual AI agent builder

[Chronos](https://github.com/popularowl/chronos) project is a fork of [Flowise](https://github.com/FlowiseAI/Flowise) - with the goal to maintain a lean visual AI agent builder tool, focused on the local and self hosted deployments.

-   [Quick Start](#quick-start)
-   [Env Variables](#env-variables)
-   [License](#license)

## Quick Start

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

## Env Variables

Chronos allows configuration via set of supported environment variables. See example [env variables](chronos_app/docker/.env.example).

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).
