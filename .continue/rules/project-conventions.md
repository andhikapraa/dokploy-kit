---
name: dokploy-manager Conventions
description: Codebase conventions for the dokploy-manager MCP server
---

This repo is an MCP server exposing the Dokploy API as grouped tools
(currently 524 endpoints across 48 tools, tracking Dokploy v0.29.2). When
making changes:

- Tools are named `dokploy_{domain}` with an `action` enum parameter (e.g.
  `dokploy_project` with `action: "create"`).
- If a query/body param is named `action`, rename it to `param_action` to avoid
  collision with the tool's action selector. Same rule for `instance` →
  `param_instance` when multi-instance mode is active.
- New endpoints flow in via `dokployapi.json`. Regenerate with `npm run parse`
  to refresh `endpoints-parsed.json` — do not hand-edit the parsed file.
- Auth is `x-api-key` (NEVER Bearer) — see dokploy-api-quirks rule.
- Run `npm test` for the unit suite (~3000 tests). Live API verification is
  `npm run verify` (requires `DOKPLOY_BASE_URL` + `DOKPLOY_API_KEY`).
