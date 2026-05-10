---
name: Dokploy API Quirks
description: Non-obvious behaviors of the Dokploy REST API
---

When working with the Dokploy API or the dokploy-manager MCP server, apply these
known quirks — they are not in the OpenAPI spec and have caused bugs before:

- **Auth uses the `x-api-key` header.** Bearer auth is rejected by Dokploy.
  Do not generate code that uses `Authorization: Bearer`.

- **`compose.update` silently drops `serverId`.** The schema does not list it.
  To move a compose between servers, delete and recreate via `compose.create`,
  which does accept `serverId`.

- **`compose.search` ignores the `query` parameter.** It returns all composes
  regardless of input. Filter client-side.

- **No `deployment.one` endpoint.** Deployment details are only available
  through `deployment.allByCompose` list responses.

- **`docker.getContainers` without `serverId`** returns containers on the
  Dokploy main host only. Pass `serverId` to query remote servers.

- **`compose.getConvertedCompose`** is the debugging tool — it shows the YAML
  with Dokploy's Traefik labels and network injection applied.

- **Container logs (v0.29.x and later):** `readLogs` actions exist on
  `application`, `compose`, `libsql`, `mariadb`, `mongo`, `mysql`, `postgres`,
  and `redis` domains. Older spec versions (≤ v0.28.8) had no logs endpoint;
  SSH was the only path.
