# mcp-stdio — test fixture

Tiny stdio MCP server used by the Chronos smoke runner to exercise the spawn-and-pool path end-to-end. Exposes two tools (`echo`, `add`) — the same pair the HTTP example exposes — so the smoke runner can swap transports without changing assertions.

## Not a reference MCP server

This is a **test fixture**, not an integration adapter. Chronos does not ship in-house reference MCP servers; register published community packages (`@modelcontextprotocol/server-postgres`, `@modelcontextprotocol/server-github`, etc.) over the stdio transport for real use cases.

## Running locally

```
cd chronos_app/docker/examples/mcp-stdio
pnpm install
pnpm start
```

The process speaks MCP over stdin/stdout. There is no HTTP surface and no port to bind. Diagnostic logs go to stderr — stdout is reserved for the JSON-RPC channel and any non-protocol output there will corrupt the stream.

## Registering it in Chronos

In the MCP Servers UI, pick **stdio** as the transport and fill:

- **Command:** `tsx`
- **Args:** `["src/index.ts"]` (with the working directory set to this fixture)

Or, after `pnpm build`, register a Node entrypoint directly.

## Smoke runner coverage

The docker smoke (`docker-compose.smoke.yml`) currently exercises only the Streamable HTTP path end-to-end. Extending it to spawn this fixture from inside the Chronos container would require baking the fixture (plus `tsx` or a precompiled bundle) into the production image — at odds with the platform's image-size posture. For now, stdio is covered by:

- Server-side unit tests under `packages/server/test/services/mcp-stdio.service.test.ts` (parse, credential resolution, argv interpolation, backoff math, env var parsing).
- Manual local registration via the MCP Servers UI against this fixture (run `pnpm start` here, then register `tsx` + `["src/index.ts"]` with the working directory set to this folder).

A future patch may add a precompiled-JS bundle of this fixture into the Chronos image so the smoke can exercise the spawn path under docker too.

