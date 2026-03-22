# Chronos – visual AI agent builder for self‑hosting

![Build Status](https://github.com/intelligexhq/chronos/actions/workflows/validate.yml/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE.md)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](chronos_app/.nvmrc)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![LangChain Core](https://img.shields.io/badge/%40langchain%2Fcore-^1.1.32-blue)](https://www.npmjs.com/package/@langchain/core)
[![LangGraph](https://img.shields.io/badge/%40langchain%2Flanggraph-^1.2.2-blue)](https://www.npmjs.com/package/@langchain/langgraph)
[![MCP SDK](https://img.shields.io/badge/%40modelcontextprotocol%2Fsdk-^1.27.1-blue)](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

> Build, run, and debug AI agents on your own infrastructure — with full visibility and control. The self-hosted, production-ready alternative to SaaS AI agent builders

<div align="center" style="padding-bottom: 35px;">
  <img src="./resources/chronos_main_page.gif" width="600" />
</div><div style="page-break-after: always;">&nbsp;</div>

[Chronos](https://intelligex.com/chronos) is a visual AI agent workflow builder designed for teams who own their infrastructure.

- Visual builder for complex agent workflows
- Fully self-hosted (local, on-prem, private cloud)
- Deep observability (trace every step of every run)

`TL;DR:` Chronos is like [Flowise](https://github.com/FlowiseAI/Flowise) — but tailored for teams who need self-hosting, observability, and production readiness.

## Why Chronos?

Most AI agent tools are great for demos — but fall apart in production. Chronos is built and used for real-world applied AI use cases

- *Own your data:* Run everything inside your infrastructure.
- *Visibility of agents actions:* Inspect prompts, tool calls, responses, errors, and token usage.
- *Cost & Performance Dashboard:* Track and optimise agent costs and operations.
- *Scheduled agents:* Maintain schedules for your agents.
- *Debug faster:* Opentelemetry helps traicing failures across the entire workflows.
- *From prototype to production:* Covers both parts, build agents visually and integrate to enterprise systems via OpenAI API specs.


## What can you build?

- Internal copilots over private company data  
- RAG pipelines with local embeddings and vector stores  
- Automated reporting and monitoring agents
- Deep research and analysis workflows
- Scheduled background agents for ongoing work.

## Quick start

Get Chronos running locally in under 5 minutes.
The fastest way to try it is to build and run `all‑in‑one` Chronos Docker image.

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

For more configuration and advanced hosting examples, including localy hosted vectorstores, Ollama, queue modes - see [Docker compose examples](./chronos_app/docker/) section.

## Get involved

- ⭐ Star this repo to support development  
- Contribute via PRs; sugest issues, features and use cases.  

## Backlog

Some of the upcoming capabilities:

- Agents with webhooks for event‑driven workflows.
- Versioning and publishing for agents.
- SSO (single sign‑on) for user logins.
- Additional tutorials on [intelligex.com](https://intelligex.com/) covering skill catalogues, deep agents, and data privacy.

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
