# Chronos – self-hosted control plane for AI agents and MCP tools

![Build Status](https://github.com/intelligexhq/chronos/actions/workflows/validate.yml/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE.md)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](chronos_app/.nvmrc)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Author agents visually on the built-in canvas, or register external agents from any framework — broker every tool through one audited MCP gateway.

<div align="center" style="padding-bottom: 35px;">
  <img src="./resources/chronos_main_page.gif" width="600" />
</div><div style="page-break-after: always;">&nbsp;</div>

## Why Chronos?

  - *[Chronos](https://intelligex.com/chronos) is an agent runtime, not a framework.* Deploy, run and manage: agents built on the Chronos visual canvas or standalone, code-first agents via OpenAI-compatible HTTP
  spec. All through one uniform invocation surface.
  - *MCP-first tool layer.* Tools are MCP servers. Agents reach them through a credential-brokered, audited gateway.
  - *Governance is the wedge.* SSO, RBAC, per-team budgets with stop-switches, audit log, PII redaction. Reporting is enforcement.
  - *Self-hosted, multiple docker compose examples.* SQLite or Postgres for persistence.
  - *Observability built in, not bolted on.* OpenTelemetry traces, replayable executions, per-step cost attribution.

## What can you build?

  - *An internal assistant that queries private databases via MCP, under audit and budget caps*.
  - *An OpenAI-compatible drop-in* — register any agent, expose it via `/v1/chat/completions`, use the Chronos MCP tool registry.
  - *Scheduled or event-driven agent jobs* (cron type scheduling, webhooks).
  - *Cost-tracked multi-team agent fleets with per-team hard limits*.

## Quick start

Get Chronos running locally in under 5 minutes.
The fastest way to try it is to build and run the `all‑in‑one` Chronos Docker image.

```bash
# clone the repository
git clone git@github.com:intelligexhq/chronos.git
cd chronos_app/docker

# build local image
docker build -f Dockerfile.local -t chronos:local ..

# run Chronos
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now available at:
# http://localhost:3001
```

For more configuration and advanced hosting examples, including locally hosted vectorstores, Ollama, queue modes — see [Docker compose examples](./chronos_app/docker/) section.

## Get involved

- ⭐ Star this repo to support development  
- Contribute via PRs; suggest issues, features and use cases.  

## Backlog

What's coming next, in rough priority order:

  - **Enterprise governance** — OIDC SSO (Entra ID, Okta, Auth0, generic OIDC), SCIM provisioning, role-based permissions, a persistent audit log with CSV export,      
  per-team budgets with hard stop-switches.
  - **MCP gateway depth** — maintained reference MCP servers (Postgres, GitHub, Slack, Jira, S3), per-server retry / rate-limit / circuit-breaker policies, OAuth2      
  credential refresh, a browseable tool catalogue.
  - **Replatforming** — package boundaries that clarify control plane vs. runtime vs. enterprise plug-points. The vision for v2.x of Chronos.

## Tutorials

These guides will get you started with running Chronos and building agents:

- [Chronos visual agent builder – up and running in a local environment](https://intelligex.com/chronos/chronos-visual-ai-agent-builder-up-and-running)
- [Chronos visual agent builder – advanced Docker Compose examples](https://intelligex.com/chronos/hosting-chronos-advanced-examples)
- [Chronos visual agent builder – build your first agent](https://intelligex.com/chronos/chronos-build-your-first-agent-flow)
- [Build a RAG agent with Qdrant and Ollama](https://intelligex.com/chronos/build-rag-for-your-documents-with-local-embeddings)
- [How and where Chronos stores data](https://intelligex.com/chronos/how-chronos-agent-builder-stores-data)

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).

## Need assistance?

We provide [professional services](https://intelligex.com/about) to help you deploy, customise, and operate Chronos in your organisation’s environment:

- Architecture and deployment in your infra (on‑prem or cloud).
- Custom agent development and integrations.
- Training and best practices for teams.
