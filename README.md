# dokploy-kit

> Two ways for AI agents to operate [Dokploy](https://dokploy.com) infrastructure: a **`dokploy` CLI + Claude Agent Skill (recommended)** and a **Model Context Protocol server**. Both wrap the same 526-endpoint Dokploy API and share a single auto-generated catalog.

Tracks **Dokploy v0.29.5**.

## Install (recommended)

If you use Claude Code (or any agent that supports the open Agent Skills standard), one command installs the skill into your agent's discovery path:

```bash
# Project-local (recommended) — installs into .claude/skills/
npx skills add andhikapraa/dokploy-kit -a claude-code

# Or globally — installs into ~/.claude/skills/
npx skills add andhikapraa/dokploy-kit -a claude-code -g
```

`npx skills` is the de-facto community installer ([vercel-labs/skills](https://github.com/vercel-labs/skills)) and supports 55+ agents — pass `-a cursor`, `-a codex`, etc. Anthropic itself recommends it for their own skills.

You'll also need the `dokploy` CLI binary on `PATH`. Three options:

```bash
# 1. Install from npm — zero clone, zero PATH setup
npm install -g dokploy-kit

# 2. Use without installing — npx fetches+caches the package each time it isn't found
#    The skill itself falls back to this if `dokploy` isn't on PATH.
npx -y dokploy-kit --help

# 3. Develop locally — clone the repo and link the bin
git clone https://github.com/andhikapraa/dokploy-kit && cd dokploy-kit && npm install && npm link
```

Set auth env (`DOKPLOY_BASE_URL` + `DOKPLOY_API_KEY` for single-instance, or `DOKPLOY_INSTANCES` JSON for multi). See [Path A](#path-a--cli--agent-skill-recommended-for-claude-code) below for the full setup.

Alternative — **Claude Code plugin marketplace** for users who prefer `/plugin` UX:

```text
/plugin marketplace add andhikapraa/dokploy-kit
/plugin install dokploy@dokploy-kit
```

## Why

The Dokploy REST API has ~500 endpoints — too many to register as individual MCP tools (most LLM clients cap tool counts and degrade with hundreds in context). Two surfaces address this differently:

- **CLI + Skill (recommended for Claude Code)** — schemas live on disk, not in the model's context window. The skill loads ~120 tokens at session start; full parameter schemas only load when Claude runs `dokploy <domain> <action> --help`. Discovery is progressive.
- **MCP server** — groups endpoints into 48 `dokploy_<domain>` tools with `action` enums. Schemas load eagerly into context at session start. Works with any MCP client (Cursor, Cline, custom).

## Which path should you pick?

| If you... | Use |
|---|---|
| ...use **Claude Code** and want to keep context lean | **CLI + Skill** — ~120 tokens idle, ~52KB schemas only when needed |
| ...use a non-Claude MCP client (Cursor, Cline, custom) | **MCP server** — schemas are the tool surface there |
| ...want fine-grained per-instance routing visible in the model's prompt | **MCP server** — `instance` enum baked into every tool schema |
| ...want to script `dokploy` from a shell, CI, or non-AI tooling | **CLI** — drop the Skill, treat it as a normal binary |

Both surfaces share `endpoints-parsed.json`, multi-instance support, and the same parity guarantees. The MCP server is **not deprecated** — both ship.

## Features

- ✅ **Full Dokploy v0.29.5 coverage** — 526 endpoints, auto-derived from the OpenAPI spec
- ✅ **Two surfaces, one catalog** — `dokploy` CLI + Claude Agent Skill, plus an MCP server. Both read `endpoints-parsed.json`.
- ✅ **Multi-instance** — point a single configuration at multiple Dokploy installs and route per-call (`--instance main` vs `--instance staging` on the CLI; `instance: "main"` arg on the MCP)
- ✅ **Self-updating** — when Dokploy ships a new version, run `npm run parse` to regenerate the catalog + skill reference from the live spec. No manual code per endpoint.
- ✅ **Zero runtime spec dependency** — the parsed endpoints are committed. Production runs don't fetch anything from Dokploy at startup.
- ✅ **3003-test MCP suite** + **192-test CLI suite** covering path formats, action mapping, schema generation, multi-instance routing, value coercion, and CLI/MCP parity

## Quick start

### 1. Install

```bash
git clone https://github.com/andhikapraa/dokploy-kit
cd dokploy-kit
npm install
```

### 2. Get a Dokploy API key

Dokploy → **Settings → API Keys → Create**. The key is sent as an `x-api-key` header (Bearer auth is not accepted by Dokploy).

### 3. Pick a surface — CLI + Skill (recommended) or MCP server

---

#### Path A — CLI + Agent Skill (recommended for Claude Code)

Keeps the LLM's context lean: the skill is a single short markdown file; full per-action parameter schemas load only when the model runs `--help`. Best when you live in Claude Code and want to spend context tokens on your code, not on tool surfaces.

**Install the skill** to a place Claude discovers (`~/.claude/skills/` for user-global or `.claude/skills/` in the project for repo-local):

```bash
# user-global
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/dokploy" ~/.claude/skills/dokploy
```

**Put the CLI on your PATH** (either way works):

```bash
# Option 1: install from this checkout
npm link

# Option 2: use it via npm script without linking
npm run cli -- --list
```

**Configure auth** — same env vars the MCP server uses. Either export them in your shell, set them in your skill's runner config, or put them in a `.envrc`/`direnv` file. For a single instance:

```bash
export DOKPLOY_BASE_URL="https://your-dokploy-host/api"
export DOKPLOY_API_KEY="your-key"
```

Multi-instance (one CLI, many Dokploys — pick per-call with `--instance NAME`):

```bash
export DOKPLOY_INSTANCES='[{"name":"main","baseUrl":"https://dokploy-a/api","apiKey":"key-a"},{"name":"staging","baseUrl":"https://dokploy-b/api","apiKey":"key-b"}]'
export DOKPLOY_DEFAULT_INSTANCE="main"
```

Then ask Claude to do Dokploy things. The skill fires on prompts like "list my projects", "deploy on staging", or "promote this app from staging to prod" — it'll discover commands via `dokploy --help` and run them.

Sanity check from a shell:

```bash
dokploy --help                       # configured instances + 48 domains
dokploy --list                       # bare domain names
dokploy project all                  # real API call
dokploy auditLog all --help          # parameter signature for a specific action
dokploy --instance staging project all
```

---

#### Path B — MCP server (for non-Claude clients, or when you want eager schemas)

Copy `.mcp.example.json` to `.mcp.json` (Claude Code auto-loads it from a project directory) or merge into your client's MCP config.

**Single-instance:**
```json
{
  "mcpServers": {
    "dokploy-kit": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/absolute/path/to/dokploy-kit",
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

Once your MCP client connects, the LLM can call:
```
dokploy_project { action: "all" }
dokploy_application { action: "create", environmentId: "...", name: "my-app", ... }
dokploy_postgres   { action: "changePassword", postgresId: "...", databasePassword: "..." }
dokploy_application { action: "readLogs", applicationId: "..." }
```

## Tool reference

48 tools, 526 actions. Examples below — every tool takes an `action` enum plus the schema for that action's parameters. Use `list_tools` in your MCP client to see the full surface for any tool.

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
npm test       # 3003 MCP + 175 CLI tests (offline, no API calls)
npm run verify # live smoke test against DOKPLOY_BASE_URL — needs DOKPLOY_API_KEY
npm run parse  # regenerate endpoints-parsed.json + skill reference from dokployapi.json
npm start      # run the MCP server (stdio transport)
npm run cli    # run the dokploy CLI directly (e.g. `npm run cli -- --list`)
```

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

- [Dokploy](https://dokploy.com) for the platform and the well-structured tRPC + OpenAPI surface
- [Model Context Protocol](https://modelcontextprotocol.io) and the [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
