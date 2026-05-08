# Chronos examples — agent registry + MCP gateway demo

docker-compose stack which showcases Chronos [Agent Registry](https://intelligex.com/chronos/agent-registry) and [MCP Gateway](https://intelligex.com/chronos/mcp-registry):

- **Chronos** local image with `ENABLE_AGENTS=true` + `ENABLE_MCP_SERVERS=true`.
- **Postgres** as the database.
- **mcp-reference** — a small MCP server example in `./mcp/`. Exposes two tools: `echo` and `add`, built locally .
- **example-agent** — a small agent in `./agent/`, showcases Chronos callback contract: when prompted with `2 + 3`, it calls back into the Chronos MCP gateway to invoke `reference.add` and embeds the result in its reply.

Examples show "Chronos-aware agent" image — with the callback flow: `x_chronos_callback_url`, `x_chronos_call_id`, Bearer to `/agent-callbacks/{xxx}/tools/invoke`. Use this example as a starting point for your own agents.

In Chronos, the MCP server side is generic — Chronos recognises any MCP server speaking `streamable-http` or `sse`. You would register real MCP servers (Postgres, GitHub, Slack, etc.) — in the v1.8 release Chronos adds several maintained reference servers to choose from.

### Why an in-tree MCP server

The first cut of this demo used `mcp/everything` (the official MCP authors' reference image). It turned out to be not very flexible:

## Setup

Build the local Chronos image (this stack consumes `chronos:local`):

```bash
cd chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
```

## Run the stack

```bash
cd chronos_app/docker/examples
## if you want to start fresh
# rm -rf .chronos && rm -rf .postgres_data 
docker compose -f docker-compose.yml up
# docker compose up --build
# docker compose up -d --no-deps chronos
```

### Example smoke test
```bash
cd chronos_app/docker/examples
# this will run automated test of registering mcp server + external http OpenAI spec agent, configure it to use mcp service and run the simple agent call to measure if end to end agent -> mcp server -> tool run is succesfull.                                                                                                                                          
docker compose -f docker-compose.smoke.yml up --build --abort-on-container-exit --exit-code-from smoke-runner
```

Services:

| Service | Host port | Notes |
|---|---|---|
| Chronos UI / API | `localhost:3001` | Initial user `admin@admin.com` / `test1234` |
| Postgres | `localhost:5432` | |
| mcp-reference | `localhost:7800` | Streamable-HTTP MCP server, exposes `echo` + `add` |
| example-agent | `localhost:8001` | `GET /health`, `POST /v1/chat/completions` |

## Walkthrough

Once docker compose is running:

### 1. Register the MCP server

1. Open `http://localhost:3001`, sign in with the initial user.
2. Navigate to **MCP Servers** in the sidebar → **Register MCP Server**.
3. Fill in:
   - **Name:** `Reference`
   - **Slug:** `reference`
   - **Transport:** `streamable-http`
   - **URL:** `http://mcp-reference:7800/mcp`
   - **allowedTools:** once the URL is filled in, **Discover Tools** activates — click it to call `tools/list` against the live server (preview, before saving) and tick `add` (and `echo` if you want) in the dropdown. You can also type bare names manually; the field is free-text.
4. Save.

### 2. Register the example agent

1. Navigate to **Agents** → **Register Agent**, pick **HTTP**.
2. Fill in:
   - **Name:** `Example agent`
   - **Slug:** `example-agent`
   - **Service endpoint:** `http://example-agent:8001`
   - **Health endpoint:** *(leave blank — defaults to the service endpoint root, where the agent serves `/health`)*
   - **Outbound auth:** None for this demo. (In production, set Bearer or a static header against a vaulted credential.)
   - **allowedTools:** add `reference.add`. Click **Load from MCP Servers** to populate the autocomplete options.
3. Save.

### 3. Copy the callback token to the agent

The example agent reads its callback token from the `CALLBACK_TOKEN` env var. After step 2:

1. Click into the new agent → Overview tab → reveal the **Callback Token** → copy.
2. Set it on the host and restart only the agent service:

```bash
   CALLBACK_TOKEN=<paste-hex-here> docker compose up -d --no-deps example-agent
```

3. Confirm the agent log says `callback configured`:

```bash
docker compose logs --tail 5 example-agent
```

### 4. Invoke the agent and exercise the round-trip

In order to send requests to agent, you need API key. Get API key from **Settings → API Keys** in the Chronos UI. Replace `<YOUR-API-KEY>` in the below example with this API key.

Issue a prompt that contains a `<n> + <m>` expression so the agent calls back into the MCP gateway. From inside the docker network so the callback URL resolves:

```bash
docker compose exec chronos sh -c '
    curl -s -X POST http://chronos:3000/api/v1/agents/example-agent/invoke \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer <YOUR-API-KEY>" \
      -d "{\"messages\":[{\"role\":\"user\",\"content\":\"please compute 2 + 3\"}]}"
'
```
You should see a response like:

```json
{"id":"xxx","object":"chat.completion","created":177818575777,"model":"example-agent","choices":[{"index":0,"message":{"role":"assistant","content":"2 + 3 = 5"},"finish_reason":"stop"}],"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}
```

Inside `docker compose logs chronos` you will see one `event=mcp.tool.invoke` audit line per round-trip — that is the v1.6 audit surface. (The persistent `tool_invocation_audit` table lands in v1.7.)

### Why invoke from inside the network?

The MCP-gateway callback URL Chronos hands the agent is built from the inbound request's `Host` header. If you invoke through `localhost:3001` from your host machine, the callback URL points at `localhost:3001` — which the agent container cannot reach. Invoking through the docker service name (`http://chronos:3000`) keeps the callback URL on the docker network where the agent can reach it.

For production deployments, set `BASE_URL` on the Chronos service to a fixed reachable URL (the platform code reads `req.get('host')` only as a default).

## Editing the example agent

The agent source is at `./agent/src/index.ts`. To iterate:

```bash
docker compose build example-agent
docker compose up -d --no-deps example-agent
```

## Cleanup

```bash
docker compose down
docker compose down --volumes   # also drop the .postgres_data and .chronos volumes
```

## Smoke test

Sibling stack that asserts the Chronos works end-to-end without operator interaction. It boots Chronos + Postgres + a self-contained `smoke-runner` container that:

- runs an embedded Streamable-HTTP MCP server with one tool, `add(a, b) → a+b`
- runs an agent `/health` stub so registration + the health poller are both happy
- logs into Chronos, registers the MCP server and an HTTP agent, reads back the auto-generated callback token
- POSTs `{ tool: "smoke.add", params: { a: 2, b: 3 } }` to `/api/v1/agent-callbacks/:agentId/tools/invoke` with that token
- asserts the result text is `"5"`, exits 0; any failure exits non-zero

This exercises the full round-trip path (callback bearer auth, allowedTools intersection, pooled MCP client, real `tools/call` against a real MCP server, audit-log line emitted) without depending on third-party images. It does NOT exercise the Chronos dispatcher → external HTTP agent half — that is unit-tested directly.

Run:

```bash
cd chronos_app/docker
docker build -f Dockerfile.local -t chronos:local ..
cd examples
docker compose -f docker-compose.smoke.yml up \
    --abort-on-container-exit --exit-code-from smoke-runner
```

Look for `[smoke] PASS` (and the `event=mcp.tool.invoke` audit line in the chronos logs). On success the runner exits 0; the compose tears down with the same code.

The smoke runner source is under `./smoke/`. It is intentionally distinct from `./agent/` — the demo agent is a clean reference operators copy; the smoke runner contains test-fixture concerns (embedded MCP server, in-process test driver) that should not pollute the demo.
