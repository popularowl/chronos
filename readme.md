# Chronos - Visual AI agent builder

<div align=center style="padding-bottom: 35px;">
<img src="./resources/chronos_main_page.gif" width="600"/>
</div>

[Chronos](https://github.com/popularowl/chronos) project is a fork of [Flowise](https://github.com/FlowiseAI/Flowise) - with the goal to maintain a lean visual AI agent builder tool, focused on the local and self hosted deployments. It provides:


- Self-hosting focused visual AI agent and workflow builder.
- Multiple deployment modes, including simple, worker queues and integrations with local LLM models.
- Horizontal scalability through Redis-based job queues and workers.
- 100+ of prebuilt LLM model integrations.
- Collection of prebuilt AI agent templates.


We do [provide professional services](https://www.popularowl.com/about/) to deploy, customise and run Chronos visual AI agent builder within your organization enviroenments.

## Summary
-   [Quick Starts](#quick-starts)
-   [Documentation](#documentation)
-   [Env Variables](#env-variables)
-   [License](#license)

## Quick Start

Chronos is tailored for the local and self hosted deployments. Most convinient way to get started quickly is to run container image (see steps below). For the more complex hosting examples see the [docker compose files](./chronos_app/docker/).

*Build and run a local Docker container image:*

```bash
cd chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now accessable on http://localhost:3001
docker stop chronos
```

More in depth [tutorials for hosting and using Chronos](https://www.popularowl.com/chronos/).

## Env Variables

Chronos allows configuration via set of supported environment variables. See example [env variables](chronos_app/docker/.env.example).

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).
