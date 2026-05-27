# Dokploy Manager - MCP Server

MCP server exposing the Dokploy API as grouped tools for Claude Code.
Currently tracks Dokploy **v0.29.5** (526 endpoints across 48 tools).

## Architecture

- `src/index.js` - MCP server entry point (stdio transport)
- `src/api-client.js` - HTTP client (auth via `x-api-key` header)
- `src/tool-generator.js` - Generates MCP tools from parsed OpenAPI spec
- `endpoints-parsed.json` - Pre-parsed endpoint metadata, regenerated from `dokployapi.json` via `npm run parse`
- `scripts/parse-spec.js` - Parser that turns the raw OpenAPI spec into the flat endpoint catalog
- `dokployapi.json` - Original OpenAPI 3.x spec (nested at `result.data.json` from Dokploy's tRPC envelope)

## Auth

All endpoints use `x-api-key: <API_KEY>` header. Bearer auth is **rejected** by Dokploy.
API key set via `DOKPLOY_API_KEY` env var (single-instance) or inside `DOKPLOY_INSTANCES` JSON (multi-instance).

## Tool naming

Tools are `dokploy_{domain}` with an `action` enum parameter.
Example: `dokploy_project` with `action: "create"`.
If a query/body param is named `action`, it's renamed to `param_action` to avoid collision (same for `instance` when multi-instance is active).

## Commands

```bash
npm start              # Start MCP server (stdio)
npm test               # Run unit tests (~3000 tests)
npm run verify         # Live API smoke test (needs DOKPLOY_BASE_URL + DOKPLOY_API_KEY)
npm run parse          # Regenerate endpoints-parsed.json from dokployapi.json
```

## Refreshing for new Dokploy versions

```bash
curl -H "x-api-key: $DOKPLOY_API_KEY" \
  "$DOKPLOY_BASE_URL/trpc/settings.getOpenApiDocument" \
  -o dokployapi.json
npm run parse
npm test
# If counts changed, update the assertions at test/run-tests.js:34,37,97
```

## Adding to Claude Code

Copy `.mcp.example.json` to `.mcp.json` and fill in real credentials (it's gitignored).
The file in this directory auto-configures the MCP server when Claude Code starts.
