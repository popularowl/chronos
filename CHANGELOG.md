# Changelog

All notable changes to Chronos. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] — 2026-05-03

First step into the control-plane direction. Run agents authored anywhere — visual canvas, code-first frameworks, OpenAI-compatible HTTP services — through one uniform invocation surface. Tools live behind an MCP gateway so agents reach them through a single credential-brokered, audited path. Existing v1.1–v1.5 surfaces are byte-for-byte unchanged.

Both new features are off by default — opt in with `ENABLE_AGENTS=true` and `ENABLE_MCP_SERVERS=true`.

### Added

- **Agent Registry.** Register agents under one roof regardless of where they run. Two runtime types: `BUILT_IN` (canvas-built agentflows) and `HTTP` (external services speaking OpenAI chat completions). One `BUILT_IN` agent is auto-registered for every existing and future agentflow.
- **Uniform invocation:** `POST /api/v1/agents/:idOrSlug/invoke` dispatches both runtime types through one entry point. Slug or UUID accepted.
- **MCP Gateway.** Agents reach tools by calling a single platform endpoint; the gateway resolves namespaced names (`<server-slug>.<tool>`), enforces the intersection of `Agent.allowedTools` and `MCPServer.allowedTools`, and proxies `tools/call` over a per-server pooled MCP client. Agents never hold MCP-server credentials directly.
- **MCP Server Registry.** Register MCP servers (Streamable HTTP and SSE transports). Each server has a slug, allowedTools, outbound auth (Bearer / static header, inline or via the Credential vault), and a configurable timeout.
- **OpenAI-compat slug fallback.** `POST /api/v1/openai/chat/completions` now accepts `Agent.slug` in the `model` field. UUID hits an `AgentFlow` first (v1.1 behaviour preserved); on miss, slug resolves an `Agent` — `BUILT_IN` follows transparently to the underlying flow, `HTTP` dispatches via the runtime with no transform. Per-agent compat surface added at `POST /api/v1/agents/:idOrSlug/chat/completions`.
- **Health pollers.** Independent pollers for HTTP agents and MCP servers (default 30s cadence, configurable). Status flips between `HEALTHY` / `UNHEALTHY` / `UNKNOWN` / `DISABLED`. `BUILT_IN` agents skip the poller and ship as `HEALTHY` (in-process).
- **Outbound auth.** Bearer or static header, with values inline or referenced from the Credential vault.
- **SSRF posture.** `serviceEndpoint`, `runtimeConfig.healthEndpoint`, and MCP server URLs reject loopback / RFC1918 / link-local addresses. Override via `ALLOW_LOOPBACK_AGENTS=true` for local dev only.
- **Audit lines.** Every gateway tool invocation emits a structured `logger.info({ event: 'mcp.tool.invoke', … })` line carrying `agentId`, `agentSlug`, `server`, `tool`, `durationMs`, and `callId`. Aggregate via your existing log pipeline. (A persistent audit table is planned.)
- **Permissions and Admin scopes.** `agents:view/create/update/delete/invoke`, `mcp-servers:view/create/update/delete`, `AGENTS_READ`/`AGENTS_WRITE`, `MCP_SERVERS_READ`/`MCP_SERVERS_WRITE`.
- **UI.** New **Agents** and **MCP Servers** pages in the sidebar. List + register dialogs. Agent detail page (Overview tab; Executions and Metrics tabs are placeholders for now). The MCP server registration dialog includes a **Discover Tools** button that calls `tools/list` against the live server before save; the agent dialog has **Load from MCP Servers** that aggregates discovery across all enabled servers and namespaces names as `<slug>.<tool>`. Both auto-populate the `allowedTools` field as removable chips.
- **OpenAPI 3.1 spec** for both directions of the protocol (platform → agent and agent → platform/MCP gateway). Served alongside the existing API documentation surface.
- **Example apps and smoke test** under `chronos_app/docker/examples/`. One docker-compose stack brings up Chronos + Postgres + a tiny Streamable-HTTP MCP server + an example HTTP agent for one-command end-to-end testing. A sibling `docker-compose.smoke.yml` runs the same protocol round-trip as an automated, exit-coded smoke test (CI-ready).

### Changed

- `@modelcontextprotocol/sdk` pinned to `1.22.0`. SDK 1.24+ ships schema introspection that depends on Zod 4 internals not present in the workspace's Zod 3 forward-compat shim, causing `new Client(...)` to throw `Schema method literal must be a string` on every gateway call. The pin works around this until a Zod 3 → 4 audit can land.

### Fixed

- **Postgres uuid-column 500s on slug input.** The dispatcher, the OpenAI resolver, and the callback middleware now gate id-lookup queries on a UUID-shape check before issuing them. Previously, passing a slug (e.g. `model: "support-agent"`) to a Postgres deployment returned `invalid input syntax for type uuid` instead of falling through to slug lookup. SQLite tolerated it; Postgres did not.
- **Pagination `-1` sentinel rejection.** UI no longer sends `page=-1, limit=-1` over the wire; the params are now omitted when not paginating, matching the server's "absent = no pagination" default.
- **Cleanup landed alongside.** Three legacy canvas URL variants collapsed into a single `/canvas/:id`. Removed the dormant Assistant concept (entity, types, dead UI branches). Dropped the "Agentflow v2" naming throughout (folders, APIs, identifiers, wire formats).

### Known limitations in 1.6.0

- HTTP-runtime token counts on `ExecutionMetrics` are written as `0` — the upstream OpenAI `usage` block is not parsed yet.
- HTTP-agent execution detail view is a minimal fallback (chips + raw JSON pane) — no node tree or call timeline.
- `stdio` MCP transport is reserved in the schema but not yet executable; registration returns `501 Not Implemented`. Use `streamable-http` or `sse`.
- OAuth2 client-credentials flows for outbound agent auth are not yet supported.
- Audit logging is structured-log only; a queryable audit table is planned.

### Environment variables introduced

| Name | Default | Purpose |
|---|---|---|
| `ENABLE_AGENTS` | `false` | Master flag for the Agent Registry. |
| `ENABLE_MCP_SERVERS` | `false` | Master flag for the MCP Gateway. |
| `AGENT_HEALTH_POLL_INTERVAL_MS` | `30000` | HTTP agent health-poll cadence. |
| `MCP_SERVER_HEALTH_POLL_INTERVAL_MS` | `30000` | MCP server health-poll cadence. |
| `MCP_CLIENT_IDLE_TIMEOUT_MS` | `300000` | Idle-close for pooled MCP clients. |
| `ALLOW_LOOPBACK_AGENTS` | `false` | Dev-only override for the SSRF gate. |

### Migrations

Five migrations run automatically on first start of 1.6.0 (SQLite + PostgreSQL):

- `1800000000005-AddAgentRegistry` — creates `agent` table; backfills one `BUILT_IN` row per existing `AgentFlow`.
- `1800000000006-AddMCPServerRegistry` — creates `mcp_server` table.
- `1800000000007-BuiltInAgentDefaultHealthy` — flips existing `BUILT_IN` rows from `UNKNOWN` to `HEALTHY`.
- `1800000000008-RemoveAssistantSupport` — coerces lingering `agent_flow.type='ASSISTANT'` rows to `'AGENTFLOW'` and drops the `assistant` table.
- `1800000000009-RenameAgentflowV2TemplateType` — rewrites `custom_template.type='AgentflowV2'` to `'Agentflow'`.

---

## Earlier versions

- **1.5.0** — Agent Versioning & Draft/Publish.
- **1.4.0** — Cost & Performance Dashboard.
- **1.3.0** — Execution Webhooks.
- **1.2.0** — Scheduled Agent Execution.
- **1.1.0** — OpenAI-Compatible Agent API.
