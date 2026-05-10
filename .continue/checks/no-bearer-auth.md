---
name: No Bearer Auth
description: Flag any new code that uses Bearer auth against the Dokploy API
---

Review this PR for any new or modified code that calls the Dokploy API
(any URL ending in `/api`, or any DokployClient construction) using Bearer
authentication.

Fail the check if you find:

- An `Authorization: Bearer` header sent to the Dokploy API
- A request that constructs auth headers from `Bearer ${token}` for the
  Dokploy API
- Documentation or comments that describe Dokploy auth as Bearer

The correct auth scheme for the Dokploy API is the `x-api-key` header.
Bearer is rejected by the server and will cause silent auth failures.

If no Bearer-auth usage is found, pass the check.
