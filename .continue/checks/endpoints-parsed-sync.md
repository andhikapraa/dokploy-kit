---
name: endpoints-parsed.json sync
description: Ensure new tool entries in src/ have matching endpoint metadata
---

Review this PR. If it adds, removes, or renames tool entries in `src/` (the
MCP server source), check that `endpoints-parsed.json` was updated in the
same PR to reflect those changes.

Fail the check if you find new `dokploy_*` tools or action handlers that do
not have a corresponding entry in `endpoints-parsed.json`.

Do not fail for unrelated source changes. Only fail when there is an actual
drift between tool definitions and the parsed endpoint metadata.

If everything is in sync, pass the check.
