#!/usr/bin/env node

/**
 * Test suite for Dokploy MCP Server
 * Validates tool generation, schema correctness, and action routing.
 */

const { generateTools } = require('../src/tool-generator.js');
const { DokployClient } = require('../src/api-client.js');
const endpoints = require('../endpoints-parsed.json');
const { z } = require('zod');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// Test 1: Tool Generation
section('Tool Generation');

const tools = generateTools(endpoints);
assert(tools.length === 48, `Generated ${tools.length} tools (expected 48)`);

const totalActions = tools.reduce((sum, t) => sum + t.actionNames.length, 0);
assert(totalActions === 526, `Total actions: ${totalActions} (expected 526)`);

// Single-instance mode (default): no 'instance' param on the shape
for (const tool of tools.slice(0, 3)) {
  assert(tool.shape.instance === undefined, `${tool.name} omits 'instance' when 1 instance configured`);
}

// Test 2: Every tool has required fields
section('Tool Structure');

for (const tool of tools) {
  assert(tool.name.startsWith('dokploy_'), `${tool.name} has correct prefix`);
  assert(typeof tool.description === 'string' && tool.description.length > 10, `${tool.name} has description`);
  assert(tool.shape.action !== undefined, `${tool.name} has action enum`);
  assert(Object.keys(tool.actionMap).length > 0, `${tool.name} has action map`);
}

// Test 3: Action map correctness
section('Action Map Integrity');

for (const tool of tools) {
  for (const [action, endpoint] of Object.entries(tool.actionMap)) {
    assert(
      endpoint.method === 'GET' || endpoint.method === 'POST',
      `${tool.name}.${action} has valid method: ${endpoint.method}`
    );
    assert(endpoint.path.startsWith('/'), `${tool.name}.${action} path starts with /: ${endpoint.path}`);
    assert(Array.isArray(endpoint.queryParams), `${tool.name}.${action} has queryParams array`);
    assert(Array.isArray(endpoint.bodyProps), `${tool.name}.${action} has bodyProps array`);
  }
}

// Test 4: Schema validation
section('Zod Schema Validation');

for (const tool of tools) {
  try {
    const schema = z.object(tool.shape);
    // Try parsing minimal valid input
    const result = schema.safeParse({ action: tool.actionNames[0] });
    assert(result.success, `${tool.name} schema parses minimal input`);
  } catch (e) {
    assert(false, `${tool.name} schema creation failed: ${e.message}`);
  }
}

// Test 5: API client construction
section('API Client');

const client = new DokployClient('https://example.com/api', 'test-key');
assert(client.baseUrl === 'https://example.com/api', 'Client stores base URL');
assert(client.apiKey === 'test-key', 'Client stores API key');

// Test 5b: Multi-instance schema injection
section('Multi-Instance Schema');

const multiTools = generateTools(endpoints, {
  instanceNames: ['main', 'tars'],
  defaultInstance: 'main',
});
assert(multiTools.length === 48, `Multi-instance generated ${multiTools.length} tools`);
for (const tool of multiTools.slice(0, 3)) {
  assert(tool.shape.instance !== undefined, `${tool.name} has 'instance' enum when multi-instance`);
  const parsed = z.object(tool.shape).safeParse({ action: tool.actionNames[0], instance: 'tars' });
  assert(parsed.success, `${tool.name} accepts valid instance`);
  const rejected = z.object(tool.shape).safeParse({ action: tool.actionNames[0], instance: 'nonexistent' });
  assert(!rejected.success, `${tool.name} rejects unknown instance`);
}

// Test 6: Endpoint coverage by domain
section('Domain Coverage');

const expectedDomains = [
  'admin', 'docker', 'compose', 'registry', 'cluster', 'user', 'domain',
  'destination', 'backup', 'deployment', 'mounts', 'certificates', 'settings',
  'security', 'redirects', 'port', 'project', 'application', 'mysql', 'postgres',
  'redis', 'mongo', 'mariadb', 'sshKey', 'gitProvider', 'bitbucket', 'github',
  'gitlab', 'gitea', 'ai', 'notification', 'organization', 'patch', 'customRole',
  'sso', 'stripe', 'licenseKey', 'whitelabeling', 'auditLog', 'environment',
  'server', 'swarm', 'previewDeployment', 'rollback', 'schedule', 'volumeBackups',
];

const toolNames = tools.map(t => t.name);
for (const domain of expectedDomains) {
  assert(toolNames.includes(`dokploy_${domain}`), `Domain '${domain}' has a tool`);
}

// Test 7: Database tools have consistent actions
section('Database Tool Consistency');

const dbTools = ['mysql', 'postgres', 'redis', 'mongo', 'mariadb'];
const expectedDbActions = [
  'changeStatus', 'create', 'deploy', 'move', 'one', 'rebuild',
  'reload', 'remove', 'saveEnvironment', 'saveExternalPort',
  'search', 'start', 'stop', 'update',
];

for (const db of dbTools) {
  const tool = tools.find(t => t.name === `dokploy_${db}`);
  if (tool) {
    for (const action of expectedDbActions) {
      assert(
        tool.actionNames.includes(action),
        `dokploy_${db} has action '${action}'`
      );
    }
  }
}

// Test 8: Path format correctness
section('Path Format');

for (const tool of tools) {
  for (const [action, ep] of Object.entries(tool.actionMap)) {
    // Path should match pattern /category.action
    const pathMatch = ep.path.match(/^\/[a-zA-Z]+\.[a-zA-Z]+/);
    assert(pathMatch !== null, `${tool.name}.${action} path format: ${ep.path}`);
  }
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
