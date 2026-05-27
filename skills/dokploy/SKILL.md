---
name: dokploy
description: Use this skill when the user wants to manage Dokploy infrastructure — projects, applications, databases (Postgres/MySQL/MongoDB/Redis/MariaDB), Docker Compose services, deployments, domains, SSL certificates, backups, servers, organizations — or wants to act across multiple Dokploy instances/environments (e.g. "promote from staging to prod", "deploy on the morvis instance"). Wraps the full Dokploy API (524 endpoints across 48 domains) behind a discoverable `dokploy` CLI.
---

# Dokploy

The `dokploy` CLI is a thin wrapper over the Dokploy API. Invoke it via Bash. **Don't try to memorize endpoints — discover them via `--help`.**

## Mental model

Every command is shaped:

```
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

The Auth section will say either:
- *"Single-instance mode. Configured: default → https://..."* — don't pass `--instance`.
- *"Configured instances (N): main (default) → ..., staging → ..."* — pass `--instance NAME` on every call that isn't the default.

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

If a Dokploy body field is named `action` or `instance`, the CLI exposes it as `--param_action` / `--param_instance` (the `action --help` output will note this). Currently no Dokploy v0.29.2 endpoint uses those names, but the rename is in place for forward compatibility.

## Common workflows

### Create a project and deploy an application

```bash
dokploy project create --name "my-service" --description "Backend"
# → { projectId: "proj_..." }

dokploy application create --projectId proj_... --name "api" --appName "api-prod"
# → { applicationId: "app_..." }

dokploy application saveGitProvider \
  --applicationId app_... --repository "owner/repo" --branch main

dokploy application deploy --applicationId app_...
```

### Provision Postgres

```bash
dokploy postgres create --projectId proj_... --name "db" --appName "db-prod" \
  --databaseName appdb --databaseUser appuser --databasePassword "..."
dokploy postgres deploy --postgresId pg_...
```

### Add a domain with SSL

```bash
dokploy domain create --applicationId app_... --host "api.example.com" \
  --https true --certificateType letsencrypt
```

### Inspect logs / status

```bash
dokploy deployment all --applicationId app_...
dokploy application one --applicationId app_...
dokploy docker getContainers
```

## Reference

`reference.md` (in this skill directory) lists every domain and action with its HTTP path. Load it only when scanning the API surface; for any specific action, `dokploy <domain> <action> --help` is the source of truth.

## Operational notes

- **All actions go through the real Dokploy API.** Destructive ops (`delete`, `remove`, `kill`) are immediate. Confirm with the user before invoking them unless they've explicitly authorized.
- **Errors:** Non-2xx responses surface as `Error: Dokploy API error (NNN): ...` on stderr with exit code 2. Missing required params or invalid `--instance` exit with code 1 *before* any network call.
- **Discoverability over memory.** Don't recall parameter names from prior sessions — rerun `--help`. The schema is the source of truth and changes with Dokploy versions.
