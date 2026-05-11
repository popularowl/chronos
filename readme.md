# Intelligex Chronos – self-hosted control plane for agents and MCP services

![Build Status](https://github.com/intelligexhq/chronos/actions/workflows/validate.yml/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE.md)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](chronos_app/.nvmrc)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Create agents visually on the built-in canvas, or register external agents from any framework — broker every tool through one audited MCP gateway.

<div align="center" style="padding-bottom: 35px;">
  <img src="./resources/chronos_main_page.gif" width="600" />
</div><div style="page-break-after: always;">&nbsp;</div>

## Why use Intelligex Chronos?

  - *[Intelligex Chronos](https://intelligex.com/chronos) is a controll plane* - deploy, run and manage agents built on the Chronos visual canvas or standalone, code-first agents via OpenAI API specification. All through one unified interface.
  - *MCP tool gateway.* Tools are MCP servers. Chronos provides MCP registry and gateway. Agents reach tools in a unified, credential-brokered, audited way.
  - *Governance is inbuilt.* SSO, RBAC, stop-switches, audit log and PII redaction.
  - *Observability built in.* OpenTelemetry traces, replayable executions, per-step cost attribution.

## Quick start

Get Intelligex Chronos running locally in under 5 minutes.
The fastest way to try it is to build and run the `all‑in‑one` Docker container image.

```bash
# clone the repository
git clone git@github.com:intelligexhq/chronos.git
cd chronos_app/docker

# build local image
docker build -f Dockerfile.local -t chronos:local ..

# run Chronos image
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now available at:
# http://localhost:3001
```

For more configuration and advanced hosting examples, including locally hosted vectorstores, Ollama, Chrons queue modes — see [Docker compose examples](./chronos_app/docker/) section.

## Get involved

- ⭐ Star this repo to support development  
- Contribute via PRs; suggest issues, features and use cases.  

## Key concepts

Concept-level overviews of the Intelligex Chronos control plane:

- [Chronos Agent registry](https://intelligex.com/chronos/agent-registry) — how canvas-built and external HTTP agents share one agent registry.
- [Chronos MCP registry](https://intelligex.com/chronos/mcp-registry) — the credential-brokered and audited Chronos MCP gateway.
- [Chronos schedules](https://intelligex.com/chronos/schedules) — recurring agent runs on a cron type schedules. In-process or queue-backed.
- [Chronos data management](https://intelligex.com/chronos/data-management) — how Chronos manages data and what data ownership means.
- [Chronos governance](https://intelligex.com/chronos/governance) — SSO, RBAC, audit and budgets.

## Tutorials

Hands-on guides for running Intelligex Chronos and managing agents.

- [Chronos self-hosted quickstart](https://intelligex.com/chronos/chronos-self-hosted-quickstart)
- [Chronos self-hosted – advanced docker compose examples](https://intelligex.com/chronos/hosting-chronos-advanced-examples)
- [Build your first canvas agent in Chronos](https://intelligex.com/chronos/chronos-build-first-canvas-agent)
- [Build a RAG agent with Qdrant and Ollama](https://intelligex.com/chronos/build-rag-for-your-documents-with-local-embeddings)
- [Register an HTTP agent in Chronos](https://intelligex.com/chronos/chronos-register-http-agent)
- [Register an MCP server in Chronos](https://intelligex.com/chronos/chronos-register-mcp-server)
- [Schedule agent runs in Chronos](https://intelligex.com/chronos/chronos-schedule-agent-runs)
- [Rotate the Chronos agent callback token](https://intelligex.com/chronos/chronos-rotate-agent-callback-token)
- [How and where Chronos stores data](https://intelligex.com/chronos/how-chronos-agent-builder-stores-data)

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).

## Need assistance?

We provide [professional services](https://intelligex.com/about) to help you deploy, customise, and integrate Intelligex Chronos in your organisations environment:

- Architecture and deployment in environments you own (private or public clouds).
- Maintaining MCP tool registries. Managing and auditing MCP tools / internal API usage.
- Training and best practice blueprints for teams who designing, building and maintaining agents and agentic systems.
