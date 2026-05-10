#!/usr/bin/env node

/**
 * Live verification test for Dokploy MCP Server.
 * Tests against the real Dokploy API to verify connectivity and basic operations.
 */

const { DokployClient } = require('../src/api-client.js');

const API_KEY = process.env.DOKPLOY_API_KEY || '';
const BASE_URL = process.env.DOKPLOY_BASE_URL || '';

if (!API_KEY) {
  console.error('DOKPLOY_API_KEY environment variable is required');
  process.exit(1);
}
if (!BASE_URL) {
  console.error('DOKPLOY_BASE_URL environment variable is required (e.g. https://dokploy.example.com/api)');
  process.exit(1);
}

const client = new DokployClient(BASE_URL, API_KEY);
let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    passed++;
    console.log(`  ✓ ${name}`);
    return result;
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
    return null;
  }
}

async function skip(name, reason) {
  skipped++;
  console.log(`  ⊘ ${name} (${reason})`);
}

async function runVerification() {
  console.log(`\nDokploy MCP Server - Live Verification`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: [redacted, ${API_KEY.length} chars]\n`);

  // 1. Health & Settings (read-only, safe)
  console.log('=== Health & Settings ===');

  await test('settings.health - API is reachable', async () => {
    const result = await client.request('/settings.health', 'GET');
    if (typeof result !== 'object') throw new Error('Unexpected response type');
    return result;
  });

  await test('settings.getDokployVersion - Get version', async () => {
    const result = await client.request('/settings.getDokployVersion', 'GET');
    console.log(`    Version: ${JSON.stringify(result)}`);
    return result;
  });

  await test('settings.getIp - Get server IP', async () => {
    const result = await client.request('/settings.getIp', 'GET');
    console.log(`    IP: ${JSON.stringify(result)}`);
    return result;
  });

  // 2. Projects (read-only)
  console.log('\n=== Projects ===');

  const projects = await test('project.all - List all projects', async () => {
    const result = await client.request('/project.all', 'GET');
    if (!Array.isArray(result)) throw new Error('Expected array response');
    console.log(`    Found ${result.length} projects`);
    return result;
  });

  if (projects && projects.length > 0) {
    const firstProject = projects[0];
    await test(`project.one - Get project: ${firstProject.name || firstProject.projectId}`, async () => {
      const result = await client.request('/project.one', 'GET', { projectId: firstProject.projectId });
      if (!result.projectId) throw new Error('Missing projectId in response');
      return result;
    });
  }

  // 3. Applications (read-only)
  console.log('\n=== Applications ===');

  if (projects && projects.length > 0) {
    for (const proj of projects.slice(0, 2)) {
      const apps = (proj.applications || []);
      if (apps.length > 0) {
        await test(`application.one - Get app: ${apps[0].name || apps[0].applicationId}`, async () => {
          const result = await client.request('/application.one', 'GET', { applicationId: apps[0].applicationId });
          if (!result.applicationId) throw new Error('Missing applicationId');
          return result;
        });
      }
    }
  }

  // 4. Docker (read-only)
  console.log('\n=== Docker ===');

  await test('docker.getContainers - List containers', async () => {
    const result = await client.request('/docker.getContainers', 'GET');
    console.log(`    Found ${Array.isArray(result) ? result.length : '?'} containers`);
    return result;
  });

  // 5. Domains (read-only)
  console.log('\n=== User & Auth ===');

  await test('user.get - Get current user', async () => {
    const result = await client.request('/user.get', 'GET');
    console.log(`    User: ${result.email || result.userId || JSON.stringify(result).substring(0, 80)}`);
    return result;
  });

  // 6. Deployments (read-only)
  console.log('\n=== Deployments ===');

  await test('deployment.allCentralized - List all deployments', async () => {
    const result = await client.request('/deployment.allCentralized', 'GET');
    console.log(`    Response type: ${typeof result}`);
    return result;
  });

  // 7. Certificates (read-only)
  console.log('\n=== Certificates ===');

  await test('certificates.all - List certificates', async () => {
    const result = await client.request('/certificates.all', 'GET');
    console.log(`    Found ${Array.isArray(result) ? result.length : '?'} certificates`);
    return result;
  });

  // 8. Registry (read-only)
  console.log('\n=== Registry ===');

  await test('registry.all - List registries', async () => {
    const result = await client.request('/registry.all', 'GET');
    console.log(`    Found ${Array.isArray(result) ? result.length : '?'} registries`);
    return result;
  });

  // 9. Notification (read-only)
  console.log('\n=== Notifications ===');

  await test('notification.all - List notification channels', async () => {
    const result = await client.request('/notification.all', 'GET');
    console.log(`    Found ${Array.isArray(result) ? result.length : '?'} channels`);
    return result;
  });

  // 10. SSH Keys (read-only)
  console.log('\n=== SSH Keys ===');

  await test('sshKey.all - List SSH keys', async () => {
    const result = await client.request('/sshKey.all', 'GET');
    console.log(`    Found ${Array.isArray(result) ? result.length : '?'} keys`);
    return result;
  });

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Live Verification: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${'='.repeat(50)}`);

  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
