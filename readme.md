# Chronos - Visual AI agent builder

![Build Status](https://github.com/intelligexhq/chronos/actions/workflows/validate.yml/badge.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE.md)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](chronos_app/.nvmrc)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![LangChain Core](https://img.shields.io/badge/%40langchain%2Fcore-^1.1.32-blue)](https://www.npmjs.com/package/@langchain/core)
[![LangGraph](https://img.shields.io/badge/%40langchain%2Flanggraph-^1.2.2-blue)](https://www.npmjs.com/package/@langchain/langgraph)
[![MCP SDK](https://img.shields.io/badge/%40modelcontextprotocol%2Fsdk-^1.27.1-blue)](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

<div align=center style="padding-bottom: 35px;">
<img src="./resources/chronos_main_page.gif" width="600"/>
</div>
<div style="page-break-after: always;">&nbsp;</div>

[Chronos](https://intelligex.com/chronos) is a visual AI agent workflow builder. Focused on the self-hosted enviroenments, with strong support for local data models and self hosted tool integrations. With enterprise grade observability, tracing and auditing.

This project has started as a fork of [Flowise](https://github.com/FlowiseAI/Flowise) - but since has implemented multiple improvements and updates towards enterprise grade and self-hosting focus.

- 100+ of prebuilt LLM model integrations, vector databases and templates.
- Enterprise level observability, tracing, loging and auditing.
- Number of [Docker compose examples](./chronos_app/docker/) to get you started fast.
- Maintained project [`backlog`](#backlog) with regular releases.

## Quick Start

Chronos is tailored for the deployments on local enviroenments and self-hosted production enviroenments. Simpliest way to get started quickly is to build and run all in one Chronos container image. For the more advanced hosting examples see the [docker compose examples](./chronos_app/docker/).

*Build and run a local Docker container image:*

```bash
# clone the project
git clone git@github.com:intelligexhq/chronos.git
# go to docker directory and build&run Chronos
cd chronos/chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
docker run -d --name chronos -p 3001:3000 chronos:local
# chronos is now accessable on http://localhost:3001
```

## Env Variables

Chronos allows configuration via set of supported environment variables. See example [env variables](chronos_app/docker/.env.example).

## Backlog

- OpenAI API specification for deployed agents.
- Versioning and publishing for agents.
- Scheduled Execution
- SSO user logins
- Agents with Webhooks
- Cost & Performance Dashboard
- Additional Chronos tutorials on [intelligex.com](https://intelligex.com/) explaining skill catalogue, deep agents, data privacy.


## Tutorials

List of tutorials and guides to get you started and building Chronos agents:

- [Chronos visual agent builder. Up and running in local enviroenment](https://intelligex.com/chronos/chronos-visual-ai-agent-builder-up-and-running)
- [Chronos visual agent builder. Advanced docker compose examples](https://intelligex.com/chronos/hosting-chronos-advanced-examples)
- [Chronos visual agent builder. Build your first agent](https://intelligex.com/chronos/chronos-build-your-first-agent-flow)
- [Chronos visual agent builder. Build RAG agent with Qdrant and Ollama](https://intelligex.com/chronos/build-rag-for-your-documents-with-local-embeddings)
- [Chronos visual agent builder. How and where data is stored](https://intelligex.com/chronos/how-chronos-agent-builder-stores-data)

## License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).

## Need Assistance?

We do [provide professional services](https://intelligex.com/about) to deploy, customise and run Chronos visual AI agent builder within your organization enviroenments.
