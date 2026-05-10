# dokploy-manager

> A Model Context Protocol (MCP) server that wraps the [Dokploy](https://dokploy.com) API, exposing **524 endpoints across 48 grouped tools** so AI agents like Claude Code can deploy apps, manage databases, configure domains, and operate Dokploy infrastructure conversationally.

Tracks **Dokploy v0.29.2**.

## Why

The Dokploy REST API has ~500 endpoints — too many to register as individual MCP tools (most LLM clients cap tool counts and degrade with hundreds in context). This server **groups endpoints by domain** (e.g. `application`, `compose`, `postgres`, `notification`) into 48 tools, each with an `action` enum that routes to the right endpoint. The result: full API coverage in a context budget your model can actually handle.

## Features

- ✅ **Full Dokploy v0.29.2 coverage** — 524 endpoints, auto-derived from the OpenAPI spec
- ✅ **Multi-instance** — point a single MCP server at multiple Dokploy installs and route per-call (`instance: "main"` vs `instance: "staging"`)
- ✅ **Self-updating** — when Dokploy ships a new version, run `npm run parse` to regenerate tool definitions from the live spec. No manual code per endpoint.
- ✅ **Zero runtime spec dependency** — the parsed endpoints are committed to the repo. Production runs don't fetch anything from Dokploy at startup.
- ✅ **2993-test suite** covering path formats, action mapping, schema generation, and multi-instance routing

## Quick start

### 1. Install

```bash
git clone https://github.com/andhikapraa/dokploy-manager
cd dokploy-manager
npm install
```

### 2. Get a Dokploy API key

Dokploy → **Settings → API Keys → Create**. The key is sent as an `x-api-key` header (Bearer auth is not accepted by Dokploy).

### 3. Add to your MCP client

Copy `.mcp.example.json` to `.mcp.json` (Claude Code auto-loads it from a project directory) or merge into your client's MCP config.

**Single-instance:**
```json
{
  "mcpServers": {
    "dokploy-manager": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/absolute/path/to/dokploy-manager",
      "env": {
        "DOKPLOY_BASE_URL": "https://your-dokploy-host/api",
        "DOKPLOY_API_KEY": "your-key"
      }
    }
  }
}
```

**Multi-instance** (route per-call via the `instance` parameter):
```json
{
  "env": {
    "DOKPLOY_INSTANCES": "[{\"name\":\"main\",\"baseUrl\":\"https://dokploy-a/api\",\"apiKey\":\"key-a\"},{\"name\":\"staging\",\"baseUrl\":\"https://dokploy-b/api\",\"apiKey\":\"key-b\"}]",
    "DOKPLOY_DEFAULT_INSTANCE": "main"
  }
}
```
`DOKPLOY_INSTANCES` is a JSON string of `{ name, baseUrl, apiKey }` objects. When set, the single-instance vars are ignored. Every tool gains an optional `instance` parameter; when omitted, calls go to `DOKPLOY_DEFAULT_INSTANCE`.

> **Path note for `cwd`:** the MCP client passes this through to `node` as the working directory. Some clients (e.g. Claude Code under `--strict-mcp-config`) ignore relative paths — always use an **absolute path**.

### 4. Use it

Once your MCP client connects, the LLM can call:
```
dokploy_project { action: "all" }
dokploy_application { action: "create", projectId: "...", name: "my-app", ... }
dokploy_postgres   { action: "changePassword", postgresId: "...", databasePassword: "..." }
dokploy_application { action: "readLogs", applicationId: "..." }
```

## Tool reference

48 tools, 524 actions. Examples below — every tool takes an `action` enum plus the schema for that action's parameters. Use `list_tools` in your MCP client to see the full surface for any tool.

| Tool | Actions | Examples |
|---|---|---|
| `dokploy_admin` | 1 | setupMonitoring |
| `dokploy_ai` | 12 | analyzeLogs, create, delete, deploy, ... |
| `dokploy_application` | 31 | cancelDeployment, create, deploy, readLogs, ... |
| `dokploy_auditLog` | 1 | all |
| `dokploy_backup` | 12 | create, manualBackupLibsql, manualBackupPostgres, ... |
| `dokploy_bitbucket` | 7 | bitbucketProviders, create, getBitbucketBranches, ... |
| `dokploy_certificates` | 5 | all, create, one, remove, update |
| `dokploy_cluster` | 4 | addManager, addWorker, getNodes, removeWorker |
| `dokploy_compose` | 30 | cancelDeployment, create, deploy, readLogs, saveEnvironment, ... |
| `dokploy_customRole` | 6 | all, create, getStatements, membersByRole, ... |
| `dokploy_deployment` | 8 | all, allByCompose, allByServer, allByType, ... |
| `dokploy_destination` | 6 | all, create, one, remove, update, ... |
| `dokploy_docker` | 12 | killContainer, removeContainer, startContainer, stopContainer, ... |
| `dokploy_domain` | 9 | byApplicationId, byComposeId, create, generateWildcard, ... |
| `dokploy_environment` | 7 | byProjectId, create, duplicate, one, ... |
| `dokploy_gitProvider` | 4 | allForPermissions, getAll, remove, toggleShare |
| `dokploy_gitea` | 8 | create, getGiteaBranches, getGiteaRepositories, ... |
| `dokploy_github` | 6 | getGithubBranches, getGithubRepositories, githubProviders, ... |
| `dokploy_gitlab` | 7 | create, getGitlabBranches, getGitlabRepositories, ... |
| `dokploy_libsql` | 14 | create, deploy, readLogs, saveEnvironment, ... |
| `dokploy_licenseKey` | 6 | activate, deactivate, haveValidLicenseKey, ... |
| `dokploy_mariadb` | 16 | changePassword, create, deploy, readLogs, ... |
| `dokploy_mongo` | 16 | changePassword, create, deploy, readLogs, ... |
| `dokploy_mounts` | 6 | allNamedByApplicationId, create, listByServiceId, ... |
| `dokploy_mysql` | 16 | changePassword, create, deploy, readLogs, ... |
| `dokploy_notification` | 41 | createDiscord, createMattermost, createSlack, createTelegram, ... |
| `dokploy_organization` | 11 | active, all, allInvitations, create, ... |
| `dokploy_patch` | 12 | byEntityId, cleanPatchRepos, create, delete, ... |
| `dokploy_port` | 4 | create, delete, one, update |
| `dokploy_postgres` | 16 | changePassword, create, deploy, readLogs, ... |
| `dokploy_previewDeployment` | 4 | all, delete, one, redeploy |
| `dokploy_project` | 9 | all, allForPermissions, create, duplicate, homeStats, ... |
| `dokploy_redirects` | 4 | create, delete, one, update |
| `dokploy_redis` | 16 | changePassword, create, deploy, readLogs, ... |
| `dokploy_registry` | 7 | all, create, one, remove, ... |
| `dokploy_rollback` | 2 | delete, rollback |
| `dokploy_schedule` | 6 | create, delete, list, one, ... |
| `dokploy_security` | 4 | create, delete, one, update |
| `dokploy_server` | 17 | all, allForPermissions, buildServers, count, ... |
| `dokploy_settings` | 51 | assignDomainServer, checkGPUStatus, checkInfrastructureHealth, getDockerDiskUsage, ... |
| `dokploy_sshKey` | 7 | all, allForApps, create, generate, ... |
| `dokploy_sso` | 10 | addTrustedOrigin, deleteProvider, listProviders, ... |
| `dokploy_stripe` | 8 | canCreateMoreServers, createCheckoutSession, getCurrentPlan, ... |
| `dokploy_swarm` | 4 | getContainerStats, getNodeApps, getNodeInfo, getNodes |
| `dokploy_tag` | 8 | all, assignToProject, bulkAssign, create, ... |
| `dokploy_user` | 23 | all, createUserWithCredentials, createApiKey, getBookmarkedTemplates, ... |
| `dokploy_volumeBackups` | 6 | create, delete, list, one, ... |
| `dokploy_whitelabeling` | 4 | get, getPublic, reset, update |

## Updating for new Dokploy versions

When Dokploy ships a release with new endpoints, refresh the spec — no manual code changes needed unless the schema layout fundamentally changes.

```bash
# Pull the live spec from any running Dokploy instance
curl -H "x-api-key: $DOKPLOY_API_KEY" \
  https://your-dokploy-host/api/trpc/settings.getOpenApiDocument \
  -o dokployapi.json

# Regenerate the flat endpoint catalog
npm run parse

# Verify
npm test
```

If tests fail with new endpoint counts (`Generated N tools (expected M)`), bump the expected counts in `test/run-tests.js` — those assertions guard against accidental regressions, not breakage.

## Architecture

```
dokployapi.json            ← raw Dokploy OpenAPI 3.x spec (tRPC-wrapped)
       ↓
scripts/parse-spec.js      ← flattens the spec
       ↓
endpoints-parsed.json      ← committed, used at runtime
       ↓
src/tool-generator.js      ← groups by tag, builds Zod schemas, emits MCP tool defs
       ↓
src/index.js               ← MCP stdio server; routes action → endpoint → DokployClient
       ↓
src/api-client.js          ← HTTP client; x-api-key header; instance-aware
```

**Auth:** Dokploy expects `x-api-key: <key>`. Bearer auth is rejected.

**Action naming:** Dokploy uses dotted paths like `/project.create`. We split on the dot — left side becomes the tool (`dokploy_project`), right side becomes an action (`create`). If a query/body parameter happens to be named `action`, it's renamed `param_action` to avoid colliding with the routing parameter.

## Development

```bash
npm test       # 2993 unit tests (offline, no API calls)
npm run verify # live smoke test against DOKPLOY_BASE_URL — needs DOKPLOY_API_KEY
npm run parse  # regenerate endpoints-parsed.json from dokployapi.json
npm start      # run the MCP server (stdio transport)
```

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

- [Dokploy](https://dokploy.com) for the platform and the well-structured tRPC + OpenAPI surface
- [Model Context Protocol](https://modelcontextprotocol.io) and the [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
