# Chronos - Visual AI agent builder

[Chronos](https://github.com/popularowl/chronos) project is a fork of [Flowise](https://github.com/FlowiseAI/Flowise) - with the goal to maintain a lean visual AI agent builder tool, focused on the local and self hosted deployments.


-   [Quick Start](#quick-start)
-   [Docker](#docker)
-   [Env Variables](#env-variables)
-   [License](#license)

## Quick Start

Chronos is tailored for the local and self hosted deployments. Most convinient way to get started with the app is to use the provided example docker compose file.

```bash
cd chronos_app/docker
docker compose up -d
docker compose ls
# chronos is now accessable on http://localhost:3001
```

## Docker

Build and run a local Docker container image

```bash
docker build -f Dockerfile.local -t chronos:local .
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now accessable on http://localhost:3001
docker stop chronos
```

## Env Variables

Chronos allows configuration via set of supported environment variables. See example [env variables](chronos_app/docker/.env.example).

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).
