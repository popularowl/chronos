# Changelog

All notable changes to Chronos. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] — 2026-05-08

UX parity + MCP Registry adoption. Built-in canvas agents now reach registered MCP servers through the same gateway HTTP agents use, and the HTTP-agent execution viewer reaches feature parity with the built-in agentflow view. Persistent audit tables land. Governance moves to v1.9; MCP gateway depth is v1.8.

### Added

- **Persistent audit tables.** `tool_invocation_audit` and `credential_access_audit` with filter API, CSV export, and a UI viewer at `/audit-log`.
- **MCP Registry Server canvas node.** Built-in agents pick a registered MCP server and select tools from the live catalog; runtime delegates to the platform gateway.
- **`Agent.allowedTools` auto-aggregation from canvas.** Saving an agentflow walks every Tool / Agent agentflow primitive for embedded selections and writes the deduplicated `<slug>.<tool>` set.
- **HTTP-agent execution viewer parity with built-in.** Unified tree pipeline; root step expands into **Request** + **Response** children with the same rendered/raw payload pane as built-in nodes.
- **Executions list `Agent` column.** `canvas agent: <name>` / `external agent: <slug>`; filter matches `agentflow.name`, `agent.name`, and `agent.slug`.
- **Agents list `Allowed MCP Tools` column.** First three chips + `+N more` overflow with full-list tooltip.

### Changed

- **MCP server health probe** switched from bare `GET` to a real `tools/list` round-trip through the pooled gateway client.
- **`@modelcontextprotocol/sdk`** `1.22.0` → `^1.29.0`; **Zod** `3.x` → `^4.4.3`.
- **HTTP-runtime `executionData`** now merges start-phase `request` with the finish-phase payload instead of clobbering.
- **HTTP-runtime token counts** parse the upstream OpenAI `usage` block; HTTP-agent rows on `ExecutionMetrics` are no longer always zero.
- **Custom MCP canvas node** description points operators at `MCP Registry Server` as the recommended path.
- **Example MCP server and agent apps** under `chronos_app/docker/examples/` log every inbound request to console.

### Documentation

- New tutorial: [*Add MCP tools to a Chronos by Intelligex canvas agent*](https://intelligex.com/chronos/chronos-canvas-agent-mcp-tools).
- `docs/agent-registry.md` § *Invoking an agent* documents the `x-request-from: internal` header convention.

### Smoke test

- Asserts the canvas-side `Agent.allowedTools` aggregator end-to-end after the existing HTTP-agent gateway round-trip.

---

## [1.6.0] — 2026-05-03

First step into the control-plane direction. Run agents authored anywhere — visual canvas, code-first frameworks, OpenAI-compatible HTTP services — through one uniform invocation surface. Tools live behind an MCP gateway so agents reach them through a single credential-brokered, audited path. Existing v1.1–v1.5 surfaces are byte-for-byte unchanged.

Both new features are off by default — opt in with `ENABLE_AGENTS=true` and `ENABLE_MCP_SERVERS=true`.

### Added

- **Agent Registry.** Two runtime types — `BUILT_IN` (canvas) and `HTTP` (external service speaking OpenAI chat completions); one `BUILT_IN` agent auto-registered per agentflow.
- **Uniform invocation** at `POST /api/v1/agents/:idOrSlug/invoke`, dispatching both runtime types through one entry point.
- **MCP Gateway.** Agents reach tools through one platform endpoint that resolves namespaced names, enforces the `Agent.allowedTools ∩ MCPServer.allowedTools` intersection, and proxies `tools/call` over a per-server pooled client.
- **MCP Server Registry.** Streamable HTTP and SSE transports, slug + allowedTools + outbound auth (Bearer / static header, inline or vaulted) per server.
- **OpenAI-compat slug fallback.** `/api/v1/openai/chat/completions` accepts `Agent.slug` in `model`; per-agent compat surface added at `/api/v1/agents/:idOrSlug/chat/completions`.
- **Health pollers** for HTTP agents and MCP servers (default 30s); `BUILT_IN` agents skip the poller and ship `HEALTHY`.
- **Outbound auth** — Bearer or static header, inline or referenced from the Credential vault.
- **SSRF posture** — agent / MCP-server URLs reject loopback / RFC1918 / link-local addresses, with `ALLOW_LOOPBACK_AGENTS=true` for local dev.
- **Audit lines** — every gateway tool invocation emits a structured `logger.info({ event: 'mcp.tool.invoke', … })` line.
- **Permissions and Admin scopes** — `agents:*`, `mcp-servers:*`, `AGENTS_READ/WRITE`, `MCP_SERVERS_READ/WRITE`.
- **UI** — Agents + MCP Servers sidebar pages, register dialogs with **Discover Tools** / **Load from MCP Servers** auto-populating `allowedTools` as chips.
- **OpenAPI 3.1 spec** covering both directions of the protocol.
- **Example apps + smoke test** under `chronos_app/docker/examples/` (one-command demo stack + CI-ready exit-coded smoke).

### Changed

- **`@modelcontextprotocol/sdk`** pinned to `1.22.0` to work around a Zod 4 introspection bug at the time. *(Lifted in v1.7.)*

### Fixed

- **Postgres uuid-column 500s on slug input** — id-lookups now gate on UUID-shape before issuing the query.
- **Pagination `-1` sentinel rejection** — UI omits the params when not paginating; matches the server's "absent = no pagination" default.
- **Cleanup** — three legacy canvas URL variants collapsed into `/canvas/:id`; dormant Assistant concept removed; "Agentflow v2" naming dropped.

---

## Earlier versions

- **1.5.0** — Agent Versioning & Draft/Publish.
- **1.4.0** — Cost & Performance Dashboard.
- **1.3.0** — Execution Webhooks.
- **1.2.0** — Scheduled Agent Execution.
- **1.1.0** — OpenAI-Compatible Agent API.
