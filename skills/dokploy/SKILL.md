---
name: dokploy
description: Use this skill when the user wants to manage Dokploy infrastructure — projects, applications, databases (Postgres/MySQL/MongoDB/Redis/MariaDB), Docker Compose services, deployments, domains, SSL certificates, backups, servers, organizations — or wants to act across multiple Dokploy instances/environments (e.g. "promote from staging to prod", "deploy on the morvis instance"). Wraps the full Dokploy API (526 endpoints across 48 domains) behind a discoverable `dokploy` CLI.
---

# Dokploy

The `dokploy` CLI is a thin wrapper over the Dokploy API. Invoke it via Bash. **Don't try to memorize endpoints — discover them via `--help`.**

## CLI invocation

The CLI is exposed two ways. Use whichever works, in this order:

```bash
# 1. Prefer the local binary if installed (faster, no npm fetch)
dokploy --help

# 2. Fall back to the npm package alias when `dokploy` is not on PATH
npx -y dokploy-kit --help
```

A one-liner that always works, with no risk of retrying a failed CLI invocation:

```bash
if command -v dokploy >/dev/null 2>&1; then
  dokploy "$@"
else
  npx -y dokploy-kit "$@"
fi
```

> **Do not** use `... && dokploy "$@" || npx -y dokploy-kit "$@"`. That falls back whenever `dokploy` exits non-zero — including legitimate failures like 4xx API errors or validation rejections — and re-runs the same command through `npx`, which is dangerous for destructive operations.

Examples below use `dokploy` for brevity. If you get `command not found`, substitute `npx -y dokploy-kit` (same flags, same output).

## Mental model

Every command is shaped:

```bash
dokploy [--instance NAME] <domain> <action> [--key value ...]
```

- **domain** — resource type: `project`, `application`, `postgres`, `compose`, `domain`, `backup`, `server`, etc.
- **action** — verb on it: `create`, `all`, `update`, `delete`, `deploy`, `start`, `stop`, etc.
- **flags** — query and body parameters for that specific action.
- **`--instance NAME`** — only when multiple Dokploy instances are configured.

## Discovery sequence

**Step 0 — always start here.** Run `dokploy --help` to see configured instances and the default. This is the cheapest call and tells you whether you're in single- or multi-instance mode.

```bash
dokploy --help
```

The Auth section will say one of:
- *"Not logged in."* — ask the user to run `dokploy login` in a separate terminal window. It prompts for the panel URL and the API key (input hidden), checks them, and saves them. It needs a real terminal: Claude Code's `!` prefix and agent Bash tools have no TTY, so the prompt cannot run there. If the agent must run the login, the user first exports `DOKPLOY_API_KEY` in their own shell and starts the agent from that shell; the agent then runs `dokploy login --url <panel-url>`, which reads the key from the environment. Either way, login stores the key in its mode-600 config file; that is the one place it should live. Never ask for the API key in chat, never pass it as a command argument, and never put it in any other file.
- *"Single-instance mode. Configured: default → https://..."* — don't pass `--instance`.
- *"Configured instances (N): main (default) → ..., staging → ..."* — pass `--instance NAME` on every call that isn't the default.

The API key is created in Dokploy under **Settings → Profile → API/CLI**. A saved login lives in `$DOKPLOY_CONFIG` if set, else `$XDG_CONFIG_HOME/dokploy/config.json`, else `~/.config/dokploy/config.json` (`dokploy login --help` prints the path in use). For API calls, credentials resolve in this order: `DOKPLOY_INSTANCES`, then `DOKPLOY_BASE_URL` with `DOKPLOY_API_KEY`, then the saved login. A set `DOKPLOY_BASE_URL` wins even without `DOKPLOY_API_KEY`, so it never falls back to the saved login's key. `DOKPLOY_API_KEY` alone does not select an instance for API calls; it is only an input to `dokploy login --url`. `dokploy logout [--name NAME]` removes a saved login.

For a machine-readable list of instances (e.g. when scripting or when the user names an instance you want to validate):

```bash
dokploy instances        # → JSON array of {name, baseUrl, isDefault}
```

**Step 1.** List domains:

```bash
dokploy --list
```

**Step 2.** List actions in a domain:

```bash
dokploy project
dokploy postgres
```

**Step 3.** Before invoking an unfamiliar action, get its parameters:

```bash
dokploy project create --help
dokploy application deploy --help
```

`--help` shows query/body params, which are required, type hints, and the underlying HTTP path.

**Step 4.** Execute. JSON to stdout; errors to stderr with non-zero exit.

```bash
dokploy --instance main project create --name "my-app" --description "API"
dokploy --instance staging application deploy --applicationId app_abc
```

## Multi-instance: when more than one Dokploy is configured

- **Always pass `--instance NAME`** for any call you don't want to land on the default. Omitting `--instance` silently routes to the default instance; that's usually wrong when the user said "staging" or "prod".
- If the user names an instance ("deploy on morvis"), verify it exists by checking the output of `dokploy --help` or `dokploy instances` before invoking — typos return a fast local error, but it's better to catch them earlier.
- **Cross-instance workflows** require an `--instance` flag on each call. Example — copy a project from staging to prod:

  ```bash
  # Read source from staging
  dokploy --instance staging project one --projectId proj_abc > /tmp/src.json

  # Inspect, then create on prod
  dokploy --instance prod project create --name "..." --description "..."
  ```

- Both instances can point at the same Dokploy host but with different API keys — useful for separating user identities or scoped tokens.

## Value coercion rules

- Plain strings pass through: `--name "my-app"`.
- Booleans: `--key=true` or `--key=false`. Bare `--flag` is `true`.
- Numbers: `--port=5432` (or `--port 5432` when the schema declares `number`).
- Arrays / objects: pass JSON. `--env '{"KEY":"value"}'`, `--ports '[80,443]'`.
- Repeating a flag → array: `--tag prod --tag api` → `["prod","api"]`.
- `=` form also works: `--name=my-app`.

Wrap JSON values in single quotes so the shell doesn't mangle them.

## Reserved flag names

If a Dokploy query or body parameter is named `action` or `instance`, the CLI exposes it as `--param_action` / `--param_instance` to avoid clashing with the positional `<action>` and the `--instance` global flag. `--help` annotates the rename with `[API field: <original>]` so it's discoverable.

The current exercised case is `dokploy auditLog all`, whose `action` query param filters by event type:

```bash
dokploy auditLog all --param_action deploy --limit 50
```

This sends `?action=deploy&limit=50` to the API. Same pattern applies to any future field named `action` or `instance` on either query or body.

## Dokploy resource hierarchy

Dokploy organizes resources as **project → environment → application/postgres/mysql/etc.** Every create flow starts at the top and threads IDs down. The link from project to environment is `--projectId`; from environment to a resource (app, db, compose) is `--environmentId` — **not** `--projectId`. This is a frequent mistake; if `--help` shows `--environmentId (required)` on a `create` action, you need an environment first.

```text
project create → projectId
environment create --projectId <id> → environmentId
application create --environmentId <id> → applicationId
postgres create --environmentId <id> → postgresId
```

## Common workflows

These examples reflect Dokploy v0.29.5 schemas. **Re-run `dokploy <domain> <action> --help` if anything looks off** — schemas drift between versions, and `--help` is the source of truth. If an example here disagrees with `--help`, trust `--help`.

### Create a project, environment, and application

```bash
dokploy project create --name "my-service" --description "Backend"
# → { projectId: "proj_..." }

dokploy environment create --projectId proj_... --name "production"
# → { environmentId: "env_..." }

dokploy application create --environmentId env_... --name "api" --appName "api-prod"
# → { applicationId: "app_..." }
```

### Attach a git source (provider-specific)

There are separate actions per git host: `saveGithubProvider`, `saveGitlabProvider`, `saveBitbucketProvider`, `saveGiteaProvider`. The generic `saveGitProvider` is for *custom* git (raw URL) and expects `--customGitUrl`, `--customGitBranch`, `--customGitBuildPath`, `--watchPaths`. Always check `--help` for the provider you need:

```bash
dokploy application saveGithubProvider --help   # check exact fields
```

Then deploy:

```bash
dokploy application deploy --applicationId app_...
```

### Provision Postgres

```bash
dokploy postgres create --environmentId env_... --name "db" \
  --databaseName appdb --databaseUser appuser --databasePassword "..."
# → { postgresId: "pg_..." }
dokploy postgres deploy --postgresId pg_...
```

### Add a domain with SSL

```bash
dokploy domain create --applicationId app_... --host "api.example.com" \
  --https true --certificateType letsencrypt
```

`--certificateType` is an enum: `letsencrypt | none | custom`.

### Wait for a deploy

After `application deploy` (or a push that auto-deploys), wait with one command instead of a shell loop. Agent sandboxes often refuse `while`/`until`/`sleep` loops, so each poll would need an approval:

```bash
dokploy deployment wait --applicationId app_...   # or --composeId; --timeout MIN (default 15)
```

It prints status changes to stderr and the final deployment as JSON. Exit 0 means `done`, 3 means `error` or `cancelled` (it prints the `readLogs` command to run), 4 means it timed out.

### Inspect logs / status

```bash
dokploy deployment all --applicationId app_...   # --applicationId is required
dokploy application one --applicationId app_...
dokploy docker getContainers --serverId srv_...  # --serverId optional
```

## Reference

`reference.md` (in this skill directory) lists every domain and action with its HTTP path. Load it only when scanning the API surface; for any specific action, `dokploy <domain> <action> --help` is the source of truth.

## Operational notes

- **All actions go through the real Dokploy API.** Destructive ops (`delete`, `remove`, `kill`) are immediate. Confirm with the user before invoking them unless they've explicitly authorized.
- **Errors:** Non-2xx responses surface as `Error: Dokploy API error (NNN): ...` on stderr with exit code 2. Missing required params or invalid `--instance` exit with code 1 *before* any network call.
- **Discoverability over memory.** Don't recall parameter names from prior sessions — rerun `--help`. The schema is the source of truth and changes with Dokploy versions.
