#!/usr/bin/env node
/**
 * Parses dokployapi.json (raw Dokploy OpenAPI 3.x spec, wrapped in tRPC envelope)
 * into endpoints-parsed.json — the flat per-endpoint shape that tool-generator.js consumes.
 *
 * Usage:
 *   node scripts/parse-spec.js                                 # default I/O paths
 *   node scripts/parse-spec.js <input.json> <output.json>      # override paths
 *
 * Refresh workflow:
 *   curl -H "x-api-key: $KEY" https://<dokploy-host>/api/trpc/settings.getOpenApiDocument \
 *     -o dokployapi.json
 *   npm run parse
 *   npm test
 */

const fs = require('fs');
const path = require('path');

function loadSpec(specPath) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec file not found: ${specPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  const spec = raw.result?.data?.json ?? raw;
  if (!spec || typeof spec !== 'object') {
    throw new Error(`${specPath} did not contain an OpenAPI document at the root or under result.data.json`);
  }
  if (!spec.openapi) {
    throw new Error(`${specPath} is missing an "openapi" version field — is this an OpenAPI spec?`);
  }
  if (!spec.paths || typeof spec.paths !== 'object') {
    throw new Error(`${specPath} is missing a "paths" object`);
  }
  return spec;
}

function parseParam(p) {
  return {
    name: p.name,
    in: p.in,
    required: p.required ?? false,
    schema: p.schema,
  };
}

function parseOperation(routePath, method, op) {
  const requestBody = op.requestBody;
  const jsonBody = requestBody?.content?.['application/json']?.schema;
  const hasBody = Boolean(requestBody);

  const endpoint = {
    path: routePath,
    method: method.toUpperCase(),
    operationId: op.operationId,
    tags: op.tags ?? [],
    params: (op.parameters ?? []).map(parseParam),
    bodyProps: jsonBody?.properties ?? {},
    bodyRequired: jsonBody?.required ?? [],
    hasBody,
  };

  if (hasBody) {
    endpoint.bodyRequired_flag = requestBody.required === true;
  }

  return endpoint;
}

function parse(spec) {
  const endpoints = [];
  for (const [routePath, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (typeof op !== 'object' || !op.operationId) continue;
      endpoints.push(parseOperation(routePath, method, op));
    }
  }
  return endpoints;
}

function main() {
  const inputPath = process.argv[2] ?? path.join(__dirname, '..', 'dokployapi.json');
  const outputPath = process.argv[3] ?? path.join(__dirname, '..', 'endpoints-parsed.json');

  const spec = loadSpec(inputPath);
  const endpoints = parse(spec);
  if (endpoints.length === 0) {
    throw new Error(`Parsed 0 endpoints from ${inputPath} — refusing to overwrite ${outputPath}. Check that the spec has populated "paths".`);
  }
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  fs.writeFileSync(outputPath, JSON.stringify(endpoints, null, 2) + '\n');

  console.log(`Parsed ${endpoints.length} endpoints from ${spec.info?.version ?? 'unknown version'}`);
  console.log(`Wrote ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { parse, loadSpec };
