#!/usr/bin/env node

/**
 * Dokploy Manager MCP Server
 * Exposes all Dokploy API endpoints as organized MCP tools, grouped by domain
 * with action-based routing. Endpoint counts derive from endpoints-parsed.json.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { DokployClient } = require('./api-client.js');
const { generateTools } = require('./tool-generator.js');
const path = require('path');
const fs = require('fs');

function parseInstances() {
  const raw = process.env.DOKPLOY_INSTANCES;
  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`Invalid DOKPLOY_INSTANCES JSON: ${e.message}`);
      process.exit(1);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error('DOKPLOY_INSTANCES must be a non-empty JSON array');
      process.exit(1);
    }
    const seen = new Set();
    for (const inst of parsed) {
      if (!inst || typeof inst !== 'object') {
        console.error('Each DOKPLOY_INSTANCES entry must be an object');
        process.exit(1);
      }
      const missing = ['name', 'baseUrl', 'apiKey'].filter((k) => !inst[k]);
      if (missing.length > 0) {
        const label = inst.name ? `'${inst.name}'` : 'unnamed entry';
        console.error(`DOKPLOY_INSTANCES ${label} is missing: ${missing.join(', ')}`);
        process.exit(1);
      }
      if (seen.has(inst.name)) {
        console.error(`Duplicate instance name: ${inst.name}`);
        process.exit(1);
      }
      seen.add(inst.name);
    }
    return parsed;
  }

  // Single-instance fallback
  const apiKey = process.env.DOKPLOY_API_KEY || '';
  const baseUrl = process.env.DOKPLOY_BASE_URL || '';
  if (!baseUrl) {
    console.error('Configure DOKPLOY_BASE_URL (e.g. https://dokploy.example.com/api) or DOKPLOY_INSTANCES.');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Warning: DOKPLOY_API_KEY is not set. All API calls will fail with 401.');
  }
  return [{ name: 'default', baseUrl, apiKey }];
}

async function main() {
  // Load the parsed endpoints
  const endpointsPath = path.join(__dirname, '..', 'endpoints-parsed.json');
  if (!fs.existsSync(endpointsPath)) {
    console.error('endpoints-parsed.json not found. Run the parser first.');
    process.exit(1);
  }

  const parsedEndpoints = JSON.parse(fs.readFileSync(endpointsPath, 'utf-8'));

  // Build per-instance client registry
  const instances = parseInstances();
  const instanceNames = instances.map((i) => i.name);
  const requestedDefault = process.env.DOKPLOY_DEFAULT_INSTANCE;
  if (requestedDefault && !instanceNames.includes(requestedDefault)) {
    console.error(`DOKPLOY_DEFAULT_INSTANCE='${requestedDefault}' not found in DOKPLOY_INSTANCES`);
    process.exit(1);
  }
  const defaultInstance = requestedDefault || instanceNames[0];
  const clients = new Map(
    instances.map((i) => [i.name, new DokployClient(i.baseUrl, i.apiKey)])
  );

  // Generate tool definitions
  const tools = generateTools(parsedEndpoints, { instanceNames, defaultInstance });

  // Create MCP server
  const server = new McpServer({
    name: 'dokploy-mcp',
    version: '1.0.0',
  });

  // Register each domain tool
  for (const tool of tools) {
    const { name, description, shape, actionMap } = tool;

    server.tool(name, description, shape, async (args) => {
      const action = args.action;
      const endpoint = actionMap[action];

      if (!endpoint) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Unknown action '${action}' for tool '${name}'` }),
          }],
          isError: true,
        };
      }

      const instanceName = args.instance || defaultInstance;
      const client = clients.get(instanceName);
      if (!client) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Unknown instance '${instanceName}'. Configured: ${instanceNames.join(', ')}`,
            }),
          }],
          isError: true,
        };
      }

      // Reserved arg keys are renamed to param_<key> to avoid collision with routing args
      const reserved = new Set(['action', 'instance']);
      const argKeyFor = (n) => (reserved.has(n) ? `param_${n}` : n);

      const missing = [];

      const queryParams = {};
      for (const param of endpoint.queryParams) {
        const argKey = argKeyFor(param);
        if (args[argKey] !== undefined) {
          queryParams[param] = args[argKey];
        } else if (endpoint.queryRequired.includes(param)) {
          missing.push(param);
        }
      }

      let body = null;
      if (endpoint.hasBody) {
        body = {};
        for (const prop of endpoint.bodyProps) {
          const argKey = argKeyFor(prop);
          if (args[argKey] !== undefined) {
            body[prop] = args[argKey];
          } else if (endpoint.bodyRequired.includes(prop)) {
            missing.push(prop);
          }
        }
      }

      if (missing.length > 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Missing required parameter(s) for ${name}.${action}: ${missing.join(', ')}`,
              action,
              path: endpoint.path,
            }),
          }],
          isError: true,
        };
      }

      try {
        // Resolve the actual API path
        // The operationId format is "tag-action" which maps to "/tag.action"
        const apiPath = endpoint.path;
        const result = await client.request(apiPath, endpoint.method, queryParams, body);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: error.message,
              action,
              path: endpoint.path,
              method: endpoint.method,
            }),
          }],
          isError: true,
        };
      }
    });
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
