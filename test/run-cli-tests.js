#!/usr/bin/env node

/**
 * CLI parity tests for src/cli.js.
 *
 * Covers the explicit MCP-parity goals plus the post-Codex-review fixes:
 *   - cliFlagFor reserved-name rename (param_action / param_instance)
 *   - parseArgs: --instance in any position, conflict detection, k/v forms
 *   - parseInstances: multi-instance success path
 *   - Integration (spawn): --list, single vs multi help shape, instances JSON,
 *     duplicate-name rejection, unknown --instance, missing required, unknown
 *     flag, auditLog `param_action` rename surfaced in --help.
 *
 * Failure paths that call process.exit() are exercised via spawnSync rather
 * than direct require to avoid killing the test runner.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const cli = require('../src/cli.js');
const endpoints = require('../endpoints-parsed.json');

const CLI_PATH = path.join(__dirname, '..', 'src', 'cli.js');

// Point every spawned CLI at an empty config dir, so a developer's own
// `dokploy login` never leaks into tests that expect "not configured".
const fs = require('fs');
const os = require('os');
const TEST_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dokploy-kit-test-'));
const TEST_CONFIG = path.join(TEST_CONFIG_DIR, 'config.json');
process.on('exit', () => fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true }));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

function spawnCli(args, envOverrides = {}) {
  // Sanitize env: keep what node needs to run, drop Dokploy vars from the
  // outer shell so tests aren't polluted by the caller's .envrc / shell exports.
  const baseEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_PATH: process.env.NODE_PATH || '',
    DOKPLOY_CONFIG: TEST_CONFIG,
  };
  // 30s timeout so a regression that hangs the CLI doesn't stall CI indefinitely.
  return spawnSync('node', [CLI_PATH, ...args], {
    env: { ...baseEnv, ...envOverrides },
    encoding: 'utf-8',
    timeout: 30_000,
  });
}

// Parse JSON from CLI output, but turn parse errors into assertion failures
// rather than crashing the test runner halfway through.
function parseJsonOrFail(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (e) {
    assert(false, `${label} must be valid JSON; got: ${stdout.slice(0, 200)} (parse error: ${e.message})`);
    return null;
  }
}

// --- Pure function tests -----------------------------------------------------

section('cliFlagFor (reserved-name rename)');
assert(cli.cliFlagFor('action') === 'param_action', "'action' → 'param_action'");
assert(cli.cliFlagFor('instance') === 'param_instance', "'instance' → 'param_instance'");
assert(cli.cliFlagFor('name') === 'name', "'name' passes through unchanged");
assert(cli.cliFlagFor('applicationId') === 'applicationId', 'arbitrary names pass through');

section('parseArgs: --instance positioning');
function parse(argv) { return cli.parseArgs(['node', 'cli.js', ...argv]); }

let r = parse(['--instance', 'staging', 'project', 'all']);
assert(!r.error && r.globalFlags.instance === 'staging', '--instance before positional → globalFlags');
assert(r.positional.length === 2 && r.positional[0] === 'project', 'positional preserved');

r = parse(['project', 'remove', '--projectId', 'X', '--instance', 'staging']);
assert(!r.error && r.globalFlags.instance === 'staging', '--instance after positional → globalFlags (P1 fix)');
assert(r.flags.projectId === 'X', 'trailing flags still parsed');
assert(r.flags.instance === undefined, '--instance does NOT leak into flags');

r = parse(['--instance', 'main', 'project', 'all', '--instance', 'main']);
assert(!r.error && r.globalFlags.instance === 'main', '--instance twice with identical value accepted');

r = parse(['--instance', 'main', 'project', 'all', '--instance', 'staging']);
assert(r.error && /conflicting/.test(r.error), '--instance twice with conflict rejected');

r = parse(['project', 'all', '--instance=staging']);
assert(!r.error && r.globalFlags.instance === 'staging', '--instance=value form works');

r = parse(['--instance']);
assert(r.error && /requires a value/.test(r.error), '--instance with no value rejected');

section('parseArgs: flag forms');
r = parse(['project', 'create', '--name=foo']);
assert(r.flags.name === 'foo', '--k=v form');

r = parse(['project', 'create', '--name', 'foo']);
assert(r.flags.name === 'foo', '--k v form');

r = parse(['x', 'y', '--tag', 'a', '--tag', 'b']);
assert(Array.isArray(r.flags.tag) && r.flags.tag.length === 2, 'repeated --k → array');

r = parse(['x', 'y', '--enabled']);
assert(r.flags.enabled === true, 'bare flag → true');

r = parse(['x', 'y', '--help']);
assert(r.flags.help === true, '--help trailing → flags.help');

// Bare positional tokens after trailing flags must be captured, not dropped.
r = parse(['project', 'create', '--name', 'foo', 'extra']);
assert(r.positional.length === 3 && r.positional[2] === 'extra',
  'bare token after trailing flag → captured into positional');

r = parse(['project', 'create', '--name=foo', 'extra']);
assert(r.positional.length === 3 && r.positional[2] === 'extra',
  'bare token after --k=v form → captured into positional');

// Single-dash tokens rejected explicitly (Opus finding: silently swallowed before).
r = parse(['-x', 'project', 'all']);
assert(r.error && /Unknown flag '-x'/.test(r.error), '-x in leading position rejected');

r = parse(['project', 'all', '-x']);
assert(r.error && /Unknown flag '-x'/.test(r.error), '-x in trailing position rejected');

r = parse(['-h']);
assert(!r.error && r.flags.help === true, '-h still allowed (aliases --help)');

// Empty --instance= rejected at parse time
r = parse(['--instance=']);
assert(r.error && /requires a value/.test(r.error), '--instance= (empty value) rejected');

section('buildIndex');
const index = cli.buildIndex(endpoints);
assert(Object.keys(index).length === 48, '48 domains indexed');
assert(index.project && index.project.create, 'project.create exists');
assert(index.auditLog && index.auditLog.all, 'auditLog.all exists');
assert(index.application && index.application.deploy, 'application.deploy exists');

section('coerce');
assert(cli.coerce('true') === true, "'true' → true");
assert(cli.coerce('false') === false, "'false' → false");
assert(cli.coerce('null') === null, "'null' → null");
assert(cli.coerce('42', { type: 'number' }) === 42, 'number coerced when schema says number');
assert(cli.coerce('foo') === 'foo', 'string passes through');
const arr = cli.coerce('[1,2,3]');
assert(Array.isArray(arr) && arr.length === 3, 'JSON array parsed');
const obj = cli.coerce('{"a":1}');
assert(obj && obj.a === 1, 'JSON object parsed');

section('effectiveType / coerce anyOf parity with MCP');
// Mirrors src/tool-generator.js openApiToZod for anyOf[primitive, null].
assert(cli.effectiveType({ type: 'string' }) === 'string', 'direct type passes through');
assert(cli.effectiveType({ anyOf: [{ type: 'number' }, { type: 'null' }] }) === 'number',
  'anyOf[number,null] → number');
assert(cli.effectiveType({ oneOf: [{ type: 'string' }, { type: 'null' }] }) === 'string',
  'oneOf[string,null] → string');
assert(cli.effectiveType({ anyOf: [{ type: 'null' }] }) === null,
  'anyOf[null] only → null type');
assert(cli.effectiveType({ anyOf: [{ type: 'string' }, { type: 'number' }] }) === null,
  'mixed primitives → null (no safe coercion)');
assert(cli.isNullable({ anyOf: [{ type: 'number' }, { type: 'null' }] }) === true,
  'anyOf with null variant is nullable');
assert(cli.isNullable({ type: 'number' }) === false, 'plain number is not nullable');

// Nested anyOf (defensive — MCP's flattenAnyOf handles this).
const nested = { anyOf: [{ anyOf: [{ type: 'string' }, { type: 'null' }] }, { type: 'null' }] };
assert(cli.effectiveType(nested) === 'string', 'nested anyOf resolves through recursion');

// The real-world case from the Codex review: domain.create.port.
const portSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] };
assert(cli.coerce('5432', portSchema) === 5432, 'nullable-number anyOf coerces "5432" → 5432 (P2 fix)');
const previewSchema = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
assert(cli.coerce('8080', previewSchema) === 8080, 'nullable-integer anyOf coerces "8080" → 8080');

// Array-of-string coerce via comma-split. Documented current behavior:
// items aren't coerced individually, so array<number> still returns strings.
const arrStr = cli.coerce('a,b,c', { type: 'array', items: { type: 'string' } });
assert(Array.isArray(arrStr) && arrStr.length === 3 && arrStr[0] === 'a', 'array<string> comma-split');
const arrNum = cli.coerce('1,2,3', { type: 'array', items: { type: 'number' } });
assert(Array.isArray(arrNum) && arrNum[0] === 1, 'array<number> comma-split coerces items to numbers');
const arrJson = cli.coerce('[1,2,3]', { type: 'array', items: { type: 'number' } });
assert(Array.isArray(arrJson) && arrJson[0] === 1, 'JSON array form preserves number type');

// Array element coercion (CodeRabbit Major):
// repeated flags arrive at coerce as a string array; comma-split also returns strings.
// Both should coerce items against schema.items so array<number> ships as numbers.
const numArrSchema = { type: 'array', items: { type: 'number' } };
const repeated = cli.coerce(['80', '443'], numArrSchema);
assert(repeated[0] === 80 && repeated[1] === 443, 'array<number>: repeated flags coerce items');
const commaSplit = cli.coerce('80,443', numArrSchema);
assert(commaSplit[0] === 80 && commaSplit[1] === 443, 'array<number>: comma-split coerces items');
const boolArr = cli.coerce(['true', 'false'], { type: 'array', items: { type: 'boolean' } });
assert(boolArr[0] === true && boolArr[1] === false, 'array<boolean>: items coerce to booleans');

// Null literal for nullable non-string schemas (CodeRabbit Major, Opus, Sonnet).
const nullableNum = { anyOf: [{ type: 'number' }, { type: 'null' }] };
assert(cli.coerce('null', nullableNum) === null, '--port null on nullable number → null');
assert(cli.coerce('null', { anyOf: [{ type: 'boolean' }, { type: 'null' }] }) === null,
  '--enabled null on nullable boolean → null');
// Non-nullable still passes through (validateValue will reject).
assert(cli.coerce('null', { type: 'number' }) === 'null',
  'null literal on non-nullable number stays as string (validator rejects)');

// Schema constraints — Codex P2 + Opus live audit.
// minLength
let err;
const minLenSchema = { type: 'string', minLength: 1 };
err = cli.validateValue('', '', minLenSchema, 'name');
assert(err && /length ≥ 1/.test(err), 'minLength enforced');
err = cli.validateValue('x', 'x', minLenSchema, 'name');
assert(err === null, 'minLength satisfied');
// minimum/maximum
const tailSchema = { type: 'number', minimum: 1, maximum: 10000 };
err = cli.validateValue(0, '0', tailSchema, 'tail');
assert(err && /≥ 1/.test(err), 'minimum enforced (`--tail 0` rejected)');
err = cli.validateValue(99999, '99999', tailSchema, 'tail');
assert(err && /≤ 10000/.test(err), 'maximum enforced');
err = cli.validateValue(100, '100', tailSchema, 'tail');
assert(err === null, 'in-range value passes');
// minItems/maxItems
const minItemsSchema = { type: 'array', items: { type: 'string' }, minItems: 1 };
err = cli.validateValue([], [], minItemsSchema, 'tags');
assert(err && /≥ 1 items/.test(err), 'minItems enforced');
// Array element validation
const numItemsSchema = { type: 'array', items: { type: 'number' } };
err = cli.validateValue([80, 'not-a-number'], [80, 'not-a-number'], numItemsSchema, 'ports');
assert(err && /ports\[1\]/.test(err), 'array element type mismatch flagged with index');
// findConstraint walks anyOf
const anyofMinSchema = { anyOf: [{ type: 'number', minimum: 1 }, { type: 'null' }] };
assert(cli.findConstraint(anyofMinSchema, 'minimum') === 1, 'findConstraint walks anyOf');

// Nested object validation (Codex round-2 P2):
// validateValue used to only check `typeof === 'object'`. With required
// properties declared on the schema, missing fields now error before reaching
// the API.
const adminMetrics = findEndpoint('admin-setupMonitoring').bodyProps.metricsConfig;
assert(adminMetrics && adminMetrics.type === 'object', 'test setup: metricsConfig is an object schema');
err = cli.validateValue({}, {}, adminMetrics, 'metricsConfig');
assert(err && /missing required property/.test(err),
  'nested object: empty object rejected when required nested fields are missing');
err = cli.validateValue({ server: {} }, { server: {} }, adminMetrics, 'metricsConfig');
assert(err && /missing required property/.test(err),
  'nested object: partial object rejected (still missing siblings)');
// Synthetic object with required nested + properties — full structural recursion.
const syntheticObj = {
  type: 'object',
  required: ['name', 'meta'],
  properties: {
    name: { type: 'string', minLength: 1 },
    meta: {
      type: 'object',
      required: ['version'],
      properties: { version: { type: 'string' } },
    },
  },
};
err = cli.validateValue({ name: 'x', meta: {} }, { name: 'x', meta: {} }, syntheticObj, 'cfg');
assert(err && /missing required property/.test(err) && /version/.test(err),
  'nested object: deep recursion catches nested-of-nested missing required');
err = cli.validateValue({ name: '', meta: { version: '1' } }, { name: '', meta: { version: '1' } }, syntheticObj, 'cfg');
assert(err && /cfg\.name/.test(err) && /length ≥ 1/.test(err),
  'nested object: child constraint failure surfaces with dotted path');
err = cli.validateValue({ name: 'x', meta: { version: '1' } }, { name: 'x', meta: { version: '1' } }, syntheticObj, 'cfg');
assert(err === null, 'nested object: fully-populated valid object passes');

section('assembleRequest (the API request assembly path)');
// Grab real endpoints from the parsed catalog so we test against the actual
// shape MCP sees — no synthetic schemas that could drift from reality.
function findEndpoint(opId) {
  const ep = endpoints.find((e) => e.operationId === opId);
  if (!ep) throw new Error(`Test setup: endpoint ${opId} not in endpoints-parsed.json`);
  return ep;
}

// GET endpoint with a required query param
const depAll = findEndpoint('deployment-all');
let req = cli.assembleRequest(depAll, { applicationId: 'app_xyz' });
assert(req.queryParams.applicationId === 'app_xyz', 'GET: query param populated');
assert(req.body === null, 'GET: body is null (no hasBody)');
assert(req.missing.length === 0, 'GET: no missing when required present');

req = cli.assembleRequest(depAll, {});
assert(req.missing.includes('applicationId'), 'GET: missing required collected');

// POST endpoint with body
const projCreate = findEndpoint('project-create');
req = cli.assembleRequest(projCreate, { name: 'my-svc', description: 'API' });
assert(req.body && req.body.name === 'my-svc', 'POST: body.name populated');
assert(req.body.description === 'API', 'POST: optional body field populated when present');
assert(req.queryParams && Object.keys(req.queryParams).length === 0, 'POST: empty queryParams object');
assert(req.missing.length === 0, 'POST: nothing missing when required present');

req = cli.assembleRequest(projCreate, {});
assert(req.missing.includes('name'), 'POST: missing required body field collected');
assert(req.body && req.body.name === undefined, 'POST: body exists even if missing required');

// Optional flags not set stay out of payload
req = cli.assembleRequest(projCreate, { name: 'x' });
assert(req.body.description === undefined, 'optional body field absent when flag not set');
assert(!('description' in req.body), 'absent fields not present as undefined keys');

// Reserved-name unwrap end-to-end: --param_action → ?action=...
const auditAll = findEndpoint('auditLog-all');
req = cli.assembleRequest(auditAll, { param_action: 'deploy', limit: 50 });
assert(req.queryParams.action === 'deploy', 'param_action flag unwraps to API field "action"');
assert(req.queryParams.limit === 50, 'concurrent non-reserved flag still placed');
assert(req.queryParams.param_action === undefined, 'unwrapped: original CLI key NOT in payload');

// Coerced types reach the right slot (the original Codex P2 #1)
const domainCreate = findEndpoint('domain-create');
req = cli.assembleRequest(domainCreate, { host: 'api.example.com', port: '5432', https: 'true' });
assert(req.body.host === 'api.example.com', 'string body param passes through');
assert(req.body.port === 5432, 'nullable-number anyOf coerces to number in payload (not "5432")');
assert(req.body.https === true, 'boolean coerces to true in payload');

// Multiple required missing → all collected
const postgresCreate = findEndpoint('postgres-create');
req = cli.assembleRequest(postgresCreate, {});
assert(req.missing.includes('name'), 'multi-missing: name flagged');
assert(req.missing.includes('databaseName'), 'multi-missing: databaseName flagged');
assert(req.missing.includes('environmentId'), 'multi-missing: environmentId flagged');
assert(req.missing.length >= 4, 'multi-missing: at least 4 required fields collected');

// Schema-less / endpoint with no params and no body → empty assembly
const dockerGetContainers = findEndpoint('docker-getContainers');
req = cli.assembleRequest(dockerGetContainers, {});
assert(Object.keys(req.queryParams).length === 0, 'no flags → empty queryParams');
assert(req.missing.length === 0, 'no required → no missing');

section('validateValue + strict coerce (block silent type mismatches)');
// --https tru: coerce now leaves 'tru' as string; validator rejects it.
const httpsField = domainCreate.bodyProps.https;
assert(httpsField, 'test setup: domain.create has https field');
err = cli.validateValue(cli.coerce('tru', httpsField), 'tru', httpsField, 'https');
assert(err && /expected true\/false/.test(err), 'invalid boolean string rejected');

// --port abc: coerce leaves 'abc' as string (Number(abc) is NaN); validator rejects.
const portField = domainCreate.bodyProps.port;
err = cli.validateValue(cli.coerce('abc', portField), 'abc', portField, 'port');
assert(err && /expected number/.test(err), 'invalid number string rejected');

// --name --description X: bare flag becomes true for a string field.
const nameField = projCreate.bodyProps.name;
err = cli.validateValue(cli.coerce(true, nameField), true, nameField, 'name');
assert(err && /bare/.test(err), 'bare flag for string field rejected');

// Valid forms still pass.
assert(cli.validateValue(true, 'true', httpsField, 'https') === null,
  '--https true still passes');
assert(cli.validateValue(false, 'false', httpsField, 'https') === null,
  '--https false still passes');
assert(cli.validateValue(5432, '5432', portField, 'port') === null,
  '--port 5432 still passes');

// Enum membership: certificateType has enum [letsencrypt|none|custom].
const certField = domainCreate.bodyProps.certificateType;
err = cli.validateValue(cli.coerce('letsencript', certField), 'letsencript', certField, 'certificateType');
assert(err && /expected one of/.test(err), 'invalid enum value rejected');
assert(cli.validateValue('letsencrypt', 'letsencrypt', certField, 'certificateType') === null,
  'valid enum value passes');

// Bare flag for boolean field is fine (means "true").
assert(cli.validateValue(true, true, httpsField, 'https') === null,
  '--https (bare) for boolean field is allowed');

// assembleRequest surfaces errors alongside missing
req = cli.assembleRequest(domainCreate, { host: 'api.example.com', https: 'tru' });
assert(req.errors.length === 1 && /https/.test(req.errors[0]),
  'assembleRequest surfaces validation errors');
assert(req.body.https === undefined,
  'invalid value NOT placed into body');
assert(req.body.host === 'api.example.com',
  'other valid fields still placed');

section('validateValue: string/object/array slot rejection (Opus-round findings)');
// String field rejecting non-string. With schema-aware coerce, `--name '[1,2,3]'`
// no longer JSON-parses; raw stays the string '[1,2,3]'. But IF someone bypasses
// coerce and feeds an array directly into validateValue, it should reject.
err = cli.validateValue([1, 2, 3], '[1,2,3]', nameField, 'name');
assert(err && /expected string/.test(err), 'validateValue rejects array in string slot');
err = cli.validateValue({ a: 1 }, '{"a":1}', nameField, 'name');
assert(err && /expected string/.test(err), 'validateValue rejects object in string slot');
err = cli.validateValue(true, 'true', nameField, 'name');
assert(err && /expected string/.test(err), 'validateValue rejects boolean in string slot');

// With the schema-aware coerce in place, `--name '[1,2,3]'` for a string slot
// should NOW pass through as the literal string '[1,2,3]' (not JSON-parsed).
const c = cli.coerce('[1,2,3]', nameField);
assert(c === '[1,2,3]', "schema-aware coerce: '[1,2,3]' stays as string when schema says string");

// And conversely, with an array-typed schema, JSON parsing still kicks in.
// Find a known object/array body field. Backups have a `metadata` field that's
// schemaless 'any' — instead, use the metricsConfig schema from admin.setupMonitoring.
const adminSetup = findEndpoint('admin-setupMonitoring');
const metricsField = adminSetup.bodyProps.metricsConfig;
assert(metricsField && metricsField.type === 'object', 'test setup: admin.setupMonitoring.metricsConfig is object');
const cobj = cli.coerce('{"server":{},"containers":{}}', metricsField);
assert(typeof cobj === 'object' && cobj.server, 'object slot still JSON-parses braced strings');
err = cli.validateValue('not json', 'not json', metricsField, 'metricsConfig');
assert(err && /expected object/.test(err), 'validateValue rejects string in object slot');
err = cli.validateValue([1, 2], '[1,2]', metricsField, 'metricsConfig');
assert(err && /expected object/.test(err), 'validateValue rejects array in object slot');

// Number coercion: tight regex rejects hex / scientific / whitespace.
const portFieldFromDomain = domainCreate.bodyProps.port;
assert(cli.coerce('0x10', portFieldFromDomain) === '0x10', 'hex string NOT coerced to number');
assert(cli.coerce('5e10', portFieldFromDomain) === '5e10', 'scientific string NOT coerced to number');
assert(cli.coerce(' 42 ', portFieldFromDomain) === ' 42 ', 'whitespace-padded NOT coerced');
assert(cli.coerce('Infinity', portFieldFromDomain) === 'Infinity', 'Infinity string NOT coerced');
assert(cli.coerce('NaN', portFieldFromDomain) === 'NaN', 'NaN string NOT coerced');
assert(cli.coerce('42', portFieldFromDomain) === 42, 'plain integer string still coerces');
assert(cli.coerce('-42', portFieldFromDomain) === -42, 'negative integer string still coerces');
assert(cli.coerce('3.14', portFieldFromDomain) === 3.14, 'decimal still coerces');

section('parseInstances (success path)');
const originalEnv = { ...process.env };
process.env.DOKPLOY_INSTANCES = JSON.stringify([
  { name: 'a', baseUrl: 'https://a/api', apiKey: 'k1' },
  { name: 'b', baseUrl: 'https://b/api', apiKey: 'k2' },
]);
delete process.env.DOKPLOY_BASE_URL;
delete process.env.DOKPLOY_API_KEY;
const insts = cli.parseInstances();
assert(insts.length === 2, '2 instances parsed');
assert(insts[0].name === 'a' && insts[1].name === 'b', 'order preserved');
// Restore env
Object.assign(process.env, originalEnv);

// --- Integration tests (spawn) -----------------------------------------------

section('Integration: --list');
r = spawnCli(['--list'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 0, '--list exits 0');
const listed = r.stdout.trim().split('\n');
assert(listed.length === 48, `--list prints 48 domains (got ${listed.length})`);
assert(listed.includes('project') && listed.includes('auditLog'), '--list includes known domains');

section('Integration: top-level --help shape');
r = spawnCli([], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.stdout.includes('Single-instance mode'), 'single-instance auth section shown');
assert(!r.stdout.includes('Configured instances ('), 'multi-instance section NOT shown for single');
assert(!r.stdout.includes('[--instance NAME]'), '--instance hidden from usage line in single-instance');

const multiEnv = {
  DOKPLOY_INSTANCES: JSON.stringify([
    { name: 'main', baseUrl: 'https://a/api', apiKey: 'k1' },
    { name: 'staging', baseUrl: 'https://b/api', apiKey: 'k2' },
  ]),
  DOKPLOY_DEFAULT_INSTANCE: 'main',
};
r = spawnCli([], multiEnv);
assert(r.stdout.includes('Configured instances (2)'), 'multi-instance section shown');
assert(r.stdout.includes('main (default)'), 'default tagged in enumeration');
assert(r.stdout.includes('staging'), 'non-default instance enumerated');
assert(r.stdout.includes('[--instance NAME]'), '--instance shown in usage line for multi');

section('Integration: dokploy instances');
r = spawnCli(['instances'], multiEnv);
assert(r.status === 0, 'instances exits 0');
const inst = parseJsonOrFail(r.stdout, 'instances stdout');
assert(Array.isArray(inst) && inst.length === 2, 'instances returns 2-element array');
assert(inst[0].name === 'main' && inst[0].isDefault === true, 'default flagged');
assert(inst[1].isDefault === false, 'non-default flagged false');
assert(!r.stdout.includes('apiKey'), 'apiKey NOT leaked');
assert(!r.stdout.includes('k1'), 'key value NOT leaked');

section('Integration: duplicate instance names rejected');
const dupEnv = {
  DOKPLOY_INSTANCES: JSON.stringify([
    { name: 'main', baseUrl: 'https://a/api', apiKey: 'k1' },
    { name: 'main', baseUrl: 'https://b/api', apiKey: 'k2' },
  ]),
};
r = spawnCli(['--list'], dupEnv);
assert(r.status === 1, 'duplicate names exit 1');
assert(r.stderr.includes('Duplicate instance name'), 'error names the problem');

section('Integration: --instance validation');
r = spawnCli(['--instance', 'bogus', 'project', 'all'], multiEnv);
assert(r.status === 1, 'leading bogus --instance exits 1');
assert(r.stderr.includes("Unknown instance 'bogus'"), 'leading bogus --instance error');
assert(r.stderr.includes('main, staging'), 'error lists valid names');

// P1 fix: trailing --instance now also validated (used to silently fall through to default)
r = spawnCli(['project', 'remove', '--projectId', 'X', '--instance', 'bogus'], multiEnv);
assert(r.status === 1, 'trailing bogus --instance exits 1 (P1 fix)');
assert(r.stderr.includes("Unknown instance 'bogus'"), 'trailing --instance reaches global validation');

// Conflicting --instance
r = spawnCli(['--instance', 'main', 'project', 'all', '--instance', 'staging'], multiEnv);
assert(r.status === 1, 'conflicting --instance exits 1');
assert(r.stderr.includes('conflicting'), 'conflict error surfaces');

section('Integration: missing required param');
r = spawnCli(['project', 'create'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'missing required exits 1');
assert(r.stderr.includes('Missing required'), 'missing-required error');
assert(r.stderr.includes('--name'), 'error names the missing flag');

section('Integration: unknown flag');
r = spawnCli(['project', 'create', '--name', 'foo', '--bogus', 'value'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'unknown flag exits 1');
assert(r.stderr.includes('Unknown flag'), 'unknown-flag error');
assert(r.stderr.includes('--bogus'), 'error names the bogus flag');
assert(r.stderr.includes('--help'), 'error points at --help');

section('Integration: reserved-name rename surfaced in --help');
r = spawnCli(['auditLog', 'all', '--help'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 0, 'auditLog all --help exits 0');
assert(r.stdout.includes('--param_action'), 'param_action shown as flag');
assert(r.stdout.includes('[API field: action]'), 'rename annotated with original field name');
assert(r.stdout.includes('enum('), 'enum schema preserved');

section('Integration: extra positional rejected');
r = spawnCli(['project', 'create', 'extra', '--name', 'foo'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'extra positional (before flags) exits 1');
assert(r.stderr.includes('Unexpected extra argument'), 'error names the issue');
assert(r.stderr.includes('extra'), 'error includes the unexpected token');

// Trailing form: previous Codex pass found this was silently dropped.
r = spawnCli(['project', 'create', '--name', 'foo', 'extra'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'extra positional (AFTER flags) exits 1');
assert(/Unexpected extra argument/.test(r.stderr), 'trailing extra positional error');
assert(/extra/.test(r.stderr), 'trailing extra token named in error');

r = spawnCli(['instances', 'bogus'], multiEnv);
assert(r.status === 1, "extra after 'instances' exits 1");
assert(r.stderr.includes("Unexpected arguments after 'instances'"), 'instances extra-arg error');

section('Integration: invalid value(s) rejected');
r = spawnCli(['domain', 'create', '--host', 'api.example.com', '--https', 'tru'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, '--https tru exits 1');
assert(/Invalid value/.test(r.stderr), 'invalid-value framing');
assert(/--https/.test(r.stderr) && /true\/false/.test(r.stderr), 'error names flag + expected form');

r = spawnCli(['domain', 'create', '--host', 'h', '--port', 'abc'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, '--port abc exits 1');
assert(/--port/.test(r.stderr) && /expected number/.test(r.stderr), 'numeric type mismatch surfaced');

r = spawnCli(['domain', 'create', '--host', 'h', '--certificateType', 'letsencript'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'enum typo exits 1');
assert(/expected one of/.test(r.stderr), 'enum validation surfaced');
assert(/letsencrypt/.test(r.stderr), 'error lists valid enum values');

// Bare flag for non-boolean: `dokploy project create --name --description API`
// would send name=true. Should error instead.
r = spawnCli(['project', 'create', '--name', '--description', 'API'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'bare --name (no value) exits 1');
assert(/--name/.test(r.stderr) && /bare/.test(r.stderr),
  'bare-flag-for-string-field surfaced');

// String field rejecting JSON-like input that doesn't deserve to be parsed.
// With schema-aware coerce, the value stays as a string — but if any test
// or path tries to send a bool/array to a string slot, validateValue catches it.
// This is a regression guard for the Opus-round string-slot finding.
r = spawnCli(['domain', 'create', '--host', 'h', '--certificateType', 'letsencript'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, 'invalid enum (regression: caught even after coerce changes)');

// Single-dash token in CLI fully rejected (integration view of the unit test).
r = spawnCli(['-x', 'project', 'all'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, "-x exits 1");
assert(/Unknown flag '-x'/.test(r.stderr), '-x error message');

// Hex/scientific in CLI integration view.
r = spawnCli(['domain', 'create', '--host', 'h', '--port', '0x80'],
  { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, '--port 0x80 exits 1 (no longer silently coerced)');
assert(/expected number/.test(r.stderr), 'hex string surfaced as type error');

section('Integration: nullable schemas surfaced in --help');
r = spawnCli(['domain', 'create', '--help'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 0, 'domain create --help exits 0');
// --port is anyOf[number, null] in the Dokploy spec; help should show 'number?' not 'any'.
assert(/--port\s+number\?/.test(r.stdout), '--port shows as nullable number (was: any)');

section('Integration: --list rejected with positional args (Sonnet+Opus finding)');
r = spawnCli(['project', 'all', '--list'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 1, '--list with positional exits 1');
assert(/--list cannot be combined/.test(r.stderr), 'error names the conflict');

section('Integration: nullable null literal end-to-end');
r = spawnCli(['domain', 'create', '--help'], { DOKPLOY_BASE_URL: 'https://x', DOKPLOY_API_KEY: 'k' });
assert(r.status === 0, 'domain create --help still works');
// (smoke for the nullable handling — unit tests above prove the coercion path)

section('Integration: missing auth (no env, no saved login)');
r = spawnCli(['--list']);  // discovery needs no credentials
assert(r.status === 0 && r.stdout.includes('project'), '--list works before login');
r = spawnCli([]);
assert(r.status === 0 && /Not logged in/.test(r.stdout), 'top help works before login and says how to log in');
r = spawnCli(['project', 'all']);
assert(r.status === 1, 'an API call without auth exits 1');
assert(r.stderr.includes('dokploy login') && r.stderr.includes('DOKPLOY_BASE_URL'), 'error names both login and the env var');
r = spawnCli(['instances']);
assert(r.status === 1 && /Not logged in/.test(r.stderr), 'instances without auth exits 1');

section('Integration: env validation failure modes');
r = spawnCli(['--list'], { DOKPLOY_INSTANCES: 'not json' });
assert(r.status === 1, 'invalid DOKPLOY_INSTANCES JSON exits 1');
assert(/Invalid DOKPLOY_INSTANCES JSON/i.test(r.stderr), 'invalid JSON error message');

r = spawnCli(['--list'], { DOKPLOY_INSTANCES: '[]' });
assert(r.status === 1, 'empty DOKPLOY_INSTANCES exits 1');
assert(/non-empty/.test(r.stderr), 'empty-array error message');

r = spawnCli(['--list'], { DOKPLOY_INSTANCES: JSON.stringify([{ name: 'a' }]) });
assert(r.status === 1, 'instance missing fields exits 1');
assert(/missing/.test(r.stderr), 'missing-field error message');
assert(/baseUrl|apiKey/.test(r.stderr), 'error names the specific missing field');

r = spawnCli(['--list'], {
  DOKPLOY_INSTANCES: JSON.stringify([{ name: 'main', baseUrl: 'https://a/api', apiKey: 'k' }]),
  DOKPLOY_DEFAULT_INSTANCE: 'nonexistent',
});
assert(r.status === 1, 'unknown DOKPLOY_DEFAULT_INSTANCE exits 1');
assert(/DOKPLOY_DEFAULT_INSTANCE/.test(r.stderr) && /nonexistent/.test(r.stderr),
  'error names the env var and bad value');

// --- Saved login (config file) ----------------------------------------------

const config = require('../src/config.js');

section('normalizeBaseUrl');
assert(config.normalizeBaseUrl('http://1.2.3.4:3000') === 'http://1.2.3.4:3000/api', 'bare panel URL gains /api');
assert(config.normalizeBaseUrl('https://d.example.com/') === 'https://d.example.com/api', 'trailing slash handled');
assert(config.normalizeBaseUrl('https://d.example.com/api/') === 'https://d.example.com/api', 'existing /api kept once');
let threw = false;
try { config.normalizeBaseUrl('ftp://x'); } catch { threw = true; }
assert(threw, 'non-http URL rejected');

section('Config file: resolution order and saved default');
{
  const saved = { defaultInstance: 'b', instances: [
    { name: 'a', baseUrl: 'https://a/api', apiKey: 'ka' },
    { name: 'b', baseUrl: 'https://b/api', apiKey: 'kb' },
  ] };
  fs.writeFileSync(TEST_CONFIG, JSON.stringify(saved));
  let rr = spawnCli(['instances']);
  const fromFile = parseJsonOrFail(rr.stdout, 'instances from file') || [];
  assert(rr.status === 0, 'saved config works with no env vars');
  assert(fromFile.length === 2 && fromFile.find((i) => i.isDefault)?.name === 'b', 'saved defaultInstance is honored');

  rr = spawnCli(['instances'], { DOKPLOY_BASE_URL: 'https://env/api', DOKPLOY_API_KEY: 'k' });
  const fromEnv = parseJsonOrFail(rr.stdout, 'instances from env') || [];
  assert(fromEnv.length === 1 && fromEnv[0].baseUrl === 'https://env/api', 'env vars take precedence over the config file');

  fs.writeFileSync(TEST_CONFIG, '{not json');
  rr = spawnCli(['--list']);
  assert(rr.status === 1 && /Invalid config file/.test(rr.stderr), 'corrupt config file fails loudly');
  fs.rmSync(TEST_CONFIG, { force: true });
}

section('Saved login: destructive and leaky edge cases');
{
  const seed = () => fs.writeFileSync(TEST_CONFIG, JSON.stringify({ defaultInstance: 'default', instances: [
    { name: 'default', baseUrl: 'https://a/api', apiKey: 'SECRET-KEY-123' },
  ] }));

  seed();
  let rr = spawnCli(['logout', '--help']);
  assert(rr.status === 0 && /Usage: dokploy logout/.test(rr.stdout), 'logout --help prints usage');
  assert(fs.existsSync(TEST_CONFIG), 'logout --help does not delete the saved login');

  rr = spawnCli(['logout', '--name']);
  assert(rr.status === 1 && /--name requires a value/.test(rr.stderr), 'logout with an empty --name fails');
  assert(fs.existsSync(TEST_CONFIG), 'logout with an empty --name does not delete everything');

  rr = spawnCli(['login', '--name', '--url', 'https://a'], { DOKPLOY_API_KEY: 'k' });
  assert(rr.status === 1 && /--name requires a value/.test(rr.stderr), 'login with an empty --name fails instead of overwriting "default"');
  rr = spawnCli(['login', '--url'], { DOKPLOY_API_KEY: 'k' });
  assert(rr.status === 1 && /--url requires a value/.test(rr.stderr), 'login with an empty --url fails');

  // A file that starts with the key: V8's JSON.parse message quotes it verbatim.
  fs.writeFileSync(TEST_CONFIG, 'SECRET-KEY-123');
  rr = spawnCli(['--list']);
  assert(rr.status === 1 && !rr.stderr.includes('SECRET-KEY-123'), 'corrupt config error does not echo file content');
  rr = spawnCli(['logout']);
  assert(rr.status === 0 && !fs.existsSync(TEST_CONFIG), 'logout deletes a corrupt config instead of stranding the key');

  rr = spawnCli(['--list'], { DOKPLOY_INSTANCES: 'SECRET-KEY-123' });
  assert(rr.status === 1 && !rr.stderr.includes('SECRET-KEY-123'), 'invalid DOKPLOY_INSTANCES error does not echo its value');
}

section('Integration: login / logout against a local fake Dokploy');
{
  // The CLI is spawned synchronously, so the fake API runs in its own process.
  // It listens on an OS-assigned port and reports it through a file; the kill
  // is registered on process exit so a failing assertion cannot orphan it.
  const portFile = path.join(TEST_CONFIG_DIR, 'fake-port');
  const fakeSrc = `
    const s = require('http').createServer((req, res) => {
      if (!req.url.startsWith('/api/project.all')) { res.writeHead(404).end(); return; }
      const ok = req.headers['x-api-key'] === 'good-key';
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(ok ? '[]' : JSON.stringify({ message: 'Unauthorized' }));
    });
    s.listen(0, '127.0.0.1', () => require('fs').writeFileSync(${JSON.stringify(portFile)}, String(s.address().port)));
  `;
  const fake = require('child_process').spawn('node', ['-e', fakeSrc], { stdio: 'ignore' });
  process.on('exit', () => { try { fake.kill(); } catch { /* already gone */ } });
  // Wait for the port file and a successful request (up to 10 s).
  const ready = spawnSync('node', ['-e', `
    const fs = require('fs'); const end = Date.now() + 10000;
    (async function poll() {
      try { const p = fs.readFileSync(${JSON.stringify(portFile)}, 'utf8'); await fetch('http://127.0.0.1:' + p + '/api/project.all'); process.exit(0); }
      catch { if (Date.now() > end) process.exit(1); setTimeout(poll, 100); }
    })();
  `], { timeout: 15_000 });
  assert(ready.status === 0, 'fake Dokploy API started');
  const panel = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8')}`;

  let rr = spawnCli(['login', '--url', panel], { DOKPLOY_API_KEY: 'bad-key' });
  assert(rr.status === 1 && /rejected/i.test(rr.stderr), 'bad key is rejected before saving');
  assert(!fs.existsSync(TEST_CONFIG), 'nothing saved after a failed login');

  rr = spawnSync('node', [CLI_PATH, 'login', '--url', panel], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DOKPLOY_CONFIG: TEST_CONFIG },
    input: 'good-key\n', encoding: 'utf-8', timeout: 30_000,
  });
  assert(rr.status === 0, 'login with a piped key succeeds');
  assert(!rr.stdout.includes('good-key') && !rr.stderr.includes('good-key'), 'API key is never echoed');
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(TEST_CONFIG, 'utf8')); } catch { return { instances: [] }; } };
  const savedCfg = readCfg();
  assert(savedCfg.instances[0]?.baseUrl === `${panel}/api` && savedCfg.defaultInstance === 'default', 'saved URL is normalized to /api and becomes default');
  if (process.platform !== 'win32') {
    assert((fs.statSync(TEST_CONFIG).mode & 0o777) === 0o600, 'config file is mode 600');
  }

  rr = spawnCli(['project', 'all']);
  assert(rr.status === 0 && rr.stdout.trim() === '[]', 'API calls use the saved login with no env vars');

  // A rewrite must restore 0600 on a loosened file and leave no temp files behind.
  if (process.platform !== 'win32') fs.chmodSync(TEST_CONFIG, 0o644);
  rr = spawnCli(['login', '--url', panel, '--name', 'second'], { DOKPLOY_API_KEY: 'good-key' });
  if (process.platform !== 'win32') {
    assert((fs.statSync(TEST_CONFIG).mode & 0o777) === 0o600, 'rewrite restores mode 600 on a loosened file');
  }
  assert(!fs.readdirSync(TEST_CONFIG_DIR).some((f) => f.endsWith('.tmp')), 'atomic write leaves no temp files');
  const two = readCfg();
  assert(rr.status === 0 && two.instances.length === 2 && two.defaultInstance === 'default', 'second login adds an instance and keeps the default');

  rr = spawnCli(['logout', '--name', 'second']);
  assert(rr.status === 0 && readCfg().instances.length === 1, 'logout --name removes one instance');
  // A temp file stranded by a hard kill mid-write must not survive logout, but
  // a live writer's in-flight temp must be left alone. A finished child gives a
  // PID that is known to be dead; the test runner's own parent is known alive.
  const deadPid = spawnSync('node', ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf-8' }).stdout.trim();
  const stranded = `${TEST_CONFIG}.${deadPid}.1.tmp`;
  const inFlight = `${TEST_CONFIG}.${process.ppid}.1.tmp`;
  fs.writeFileSync(stranded, '{"instances":[{"apiKey":"good-key"}]}');
  fs.writeFileSync(inFlight, '{}');
  rr = spawnCli(['logout']);
  assert(rr.status === 0 && !fs.existsSync(TEST_CONFIG), 'logout removes the config file');
  assert(!fs.existsSync(stranded), 'logout also removes a stranded temp file');
  assert(fs.existsSync(inFlight), 'logout keeps a temp file whose writer is still running');
  fs.rmSync(inFlight, { force: true });

  // Removing the last instance by name must sweep stranded temps too.
  rr = spawnCli(['login', '--url', panel], { DOKPLOY_API_KEY: 'good-key' });
  fs.writeFileSync(stranded, '{"instances":[{"apiKey":"good-key"}]}');
  rr = spawnCli(['logout', '--name', 'default']);
  assert(rr.status === 0 && !fs.existsSync(TEST_CONFIG), 'logout --name of the last instance removes the config');
  assert(!fs.existsSync(stranded), 'logout --name also removes a stranded temp file');

  // Only names writeConfigFile creates are swept.
  const userTmp = `${TEST_CONFIG}.backup.tmp`;
  fs.writeFileSync(userTmp, 'keep me');
  rr = spawnCli(['logout']);
  assert(fs.existsSync(userTmp), 'logout leaves unrelated *.tmp files alone');
  fs.rmSync(userTmp, { force: true });

  // Concurrent saves must not drop each other's instance. Writers start at the
  // same instant and call saveInstance in a loop, so read-modify-write races
  // show up reliably without the lock.
  const { spawn: spawnAsync } = require('child_process');
  const configModule = path.join(__dirname, '..', 'src', 'config.js');
  const startAt = Date.now() + 1500;
  const writers = 16, perWriter = 20;
  const saverSrc = (w) => `
    const c = require(${JSON.stringify(configModule)});
    while (Date.now() < ${startAt}) {}
    for (let i = 0; i < ${perWriter}; i++) c.saveInstance({ name: 'w${w}-' + i, baseUrl: 'https://x/api', apiKey: 'k' });
  `;
  const children = Array.from({ length: writers }, (_, w) => spawnAsync('node', ['-e', saverSrc(w)], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DOKPLOY_CONFIG: TEST_CONFIG },
    stdio: 'ignore',
  }));
  let exited = 0;
  children.forEach((ch) => ch.on('exit', () => { exited++; }));
  const waitUntil = Date.now() + 30_000;
  while (exited < writers && Date.now() < waitUntil) spawnSync('node', ['-e', 'setTimeout(()=>{},50)']);
  const concurrent = readCfg();
  assert(concurrent.instances.length === writers * perWriter, `concurrent saves keep every instance (${concurrent.instances.length}/${writers * perWriter})`);
  assert(!fs.existsSync(`${TEST_CONFIG}.lock`), 'lock is released after concurrent saves');
  spawnCli(['logout']);

  // A lock left by a killed process is taken over once it is old enough.
  fs.mkdirSync(`${TEST_CONFIG}.lock`);
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(`${TEST_CONFIG}.lock`, old, old);
  rr = spawnCli(['login', '--url', panel], { DOKPLOY_API_KEY: 'good-key' });
  assert(rr.status === 0 && readCfg().instances.length === 1, 'login takes over a stale lock');
  assert(!fs.existsSync(`${TEST_CONFIG}.lock`), 'stale lock is gone after takeover');
  spawnCli(['logout']);

  // A redirect from the panel must not carry the API key to another origin.
  const redirFile = path.join(TEST_CONFIG_DIR, 'redir-port');
  const leakFile = path.join(TEST_CONFIG_DIR, 'leaked');
  const redirSrc = `
    const http = require('http'), fs = require('fs');
    const other = http.createServer((q, r) => { fs.writeFileSync(${JSON.stringify(leakFile)}, String(q.headers['x-api-key'] || '')); r.writeHead(200, {'Content-Type':'application/json'}); r.end('[]'); });
    other.listen(0, '127.0.0.1', () => {
      const op = other.address().port;
      const s = http.createServer((q, r) => { r.writeHead(302, { Location: 'http://localhost:' + op + q.url }); r.end(); });
      s.listen(0, '127.0.0.1', () => fs.writeFileSync(${JSON.stringify(redirFile)}, String(s.address().port)));
    });
  `;
  const redir = spawnAsync('node', ['-e', redirSrc], { stdio: 'ignore' });
  process.on('exit', () => { try { redir.kill(); } catch { /* gone */ } });
  const rwait = Date.now() + 10_000;
  while (!fs.existsSync(redirFile) && Date.now() < rwait) spawnSync('node', ['-e', 'setTimeout(()=>{},50)']);
  rr = spawnCli(['login', '--url', `http://127.0.0.1:${fs.readFileSync(redirFile, 'utf8')}`], { DOKPLOY_API_KEY: 'good-key' });
  assert(rr.status === 1 && /redirect/i.test(rr.stderr), 'login refuses a redirecting panel URL');
  assert(!fs.existsSync(leakFile), 'the API key never reaches the redirect target');
  assert(!fs.existsSync(TEST_CONFIG), 'nothing is saved after a refused redirect');

  // A same-origin redirect (path canonicalization) is followed and works.
  const sameFile = path.join(TEST_CONFIG_DIR, 'same-port');
  const sameSrc = `
    const http = require('http'), fs = require('fs');
    const s = http.createServer((q, r) => {
      if (q.url.startsWith('/old/api/')) { r.writeHead(301, { Location: q.url.replace('/old/api/', '/api/') }); r.end(); return; }
      const ok = q.url.startsWith('/api/project.all') && q.headers['x-api-key'] === 'good-key';
      r.writeHead(ok ? 200 : 401, {'Content-Type':'application/json'}); r.end(ok ? '[]' : '{"message":"no"}');
    });
    s.listen(0, '127.0.0.1', () => fs.writeFileSync(${JSON.stringify(sameFile)}, String(s.address().port)));
  `;
  const same = spawnAsync('node', ['-e', sameSrc], { stdio: 'ignore' });
  process.on('exit', () => { try { same.kill(); } catch { /* gone */ } });
  const swait = Date.now() + 10_000;
  while (!fs.existsSync(sameFile) && Date.now() < swait) spawnSync('node', ['-e', 'setTimeout(()=>{},50)']);
  rr = spawnCli(['login', '--url', `http://127.0.0.1:${fs.readFileSync(sameFile, 'utf8')}/old`], { DOKPLOY_API_KEY: 'good-key' });
  assert(rr.status === 0, 'login follows a same-origin redirect');
  spawnCli(['logout']);
  same.kill();
  redir.kill();

  rr = spawnCli(['login', '--url', 'http://127.0.0.1:1'], { DOKPLOY_API_KEY: 'good-key' });
  assert(rr.status === 1 && /Could not reach/.test(rr.stderr), 'unreachable URL gives a reachability hint');

  rr = spawnCli(['login', '--url', panel, '--apiKey', 'x']);
  assert(rr.status === 1 && /Unknown flag/.test(rr.stderr), 'API key is not accepted as a flag');

}

section('Integration: deployment wait against a local fake Dokploy');
{
  // Fake API. Per ID, the newest deployment flips to its final status on the
  // 3rd poll: "ok" -> done, "bad" -> error, "slow" never finishes, "flaky"
  // answers 502 on its first poll, "late" adds a NEW deployment only from the
  // 3rd poll on (like a push webhook), "none" has no deployments. Each ID must
  // be requested on the matching route.
  const portFile = path.join(TEST_CONFIG_DIR, 'wait-port');
  const fakeSrc = `
    const polls = {};
    // The "late" deployment is created at the moment of its 2nd poll, i.e.
    // after wait has started, like a push webhook arriving a few seconds late.
    // "racy" creates it during the very first poll, before that response is
    // sent, the case where an ID snapshot would wrongly exclude it.
    const createdAt = {};
    const s = require('http').createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const isCompose = u.searchParams.has('composeId');
      if (u.pathname !== (isCompose ? '/api/deployment.allByCompose' : '/api/deployment.all')) { res.writeHead(404).end(); return; }
      const id = u.searchParams.get('applicationId') || u.searchParams.get('composeId');
      const n = polls[id] = (polls[id] || 0) + 1;
      if (id === 'flaky' && n === 1) { res.writeHead(502).end('bad gateway'); return; }
      const old = { deploymentId: 'old', status: 'done', createdAt: '2026-01-01T00:00:00Z', title: 'older' };
      const finalOf = { ok: 'done', bad: 'error', flaky: 'done' };
      let list;
      if (id === 'none') list = [];
      else if (id === 'late' || id === 'racy') {
        const startAt = id === 'late' ? 2 : 1;
        if (n >= startAt && !createdAt[id]) createdAt[id] = new Date(Date.now() + 1500).toISOString();
        list = createdAt[id] ? [old, { deploymentId: 'new-' + id, status: n >= startAt + 2 ? 'done' : 'running', createdAt: createdAt[id] }] : [old];
      } else list = [old, { deploymentId: 'new-' + id, status: n >= 3 ? (finalOf[id] || 'running') : 'running', createdAt: '2026-01-02T00:00:00Z', title: 'newest' }];
      res.writeHead(200, { 'Content-Type': 'application/json', Date: new Date().toUTCString() });
      res.end(JSON.stringify(list));
    });
    s.listen(0, '127.0.0.1', () => require('fs').writeFileSync(${JSON.stringify(portFile)}, String(s.address().port)));
  `;
  const fake = require('child_process').spawn('node', ['-e', fakeSrc], { stdio: 'ignore' });
  process.on('exit', () => { try { fake.kill(); } catch { /* gone */ } });
  const end = Date.now() + 10_000;
  while (!fs.existsSync(portFile) && Date.now() < end) spawnSync('node', ['-e', 'setTimeout(()=>{},50)']);
  const env = { DOKPLOY_BASE_URL: `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8')}/api`, DOKPLOY_API_KEY: 'k' };
  const wait = (args) => spawnCli(['deployment', 'wait', '--interval', '1', ...args], env);

  let rr = wait(['--applicationId', 'ok']);
  const done = parseJsonOrFail(rr.stdout, 'wait done');
  assert(rr.status === 0 && done?.deploymentId === 'new-ok' && done?.status === 'done', 'wait exits 0 with the newest deployment once it is done');
  assert(/running/.test(rr.stderr) && /done/.test(rr.stderr), 'wait reports status changes on stderr');

  rr = wait(['--composeId', 'bad']);
  const failed = parseJsonOrFail(rr.stdout, 'wait error');
  assert(rr.status === 3 && failed?.deploymentId === 'new-bad' && failed?.status === 'error', 'wait exits 3 and prints the failed deployment as JSON (compose route)');
  assert(/readLogs --deploymentId new-bad/.test(rr.stderr), 'wait points to the build log on error');

  rr = wait(['--applicationId', 'flaky']);
  assert(rr.status === 0 && /poll failed, retrying/.test(rr.stderr), 'wait retries a transient 502 instead of giving up');

  rr = wait(['--applicationId', 'late']);
  assert(rr.status === 0 && parseJsonOrFail(rr.stdout, 'late no --new')?.deploymentId === 'old', 'without --new, wait accepts the newest existing deployment');
  rr = wait(['--applicationId', 'late', '--new']);
  assert(rr.status === 0 && parseJsonOrFail(rr.stdout, 'late --new')?.deploymentId === 'new-late', 'with --new, wait ignores existing deployments and waits for the next one');
  rr = wait(['--applicationId', 'racy', '--new']);
  assert(rr.status === 0 && parseJsonOrFail(rr.stdout, 'racy --new')?.deploymentId === 'new-racy', 'with --new, a deployment created during the first poll still counts');
  rr = wait(['--applicationId', 'ok', '--timeout', '0.0333']);
  assert(rr.status === 0, 'a fractional --timeout does not break the request timeout');

  const t0 = Date.now();
  rr = wait(['--applicationId', 'slow', '--timeout', '0.05']);
  assert(rr.status === 4 && /Still running/.test(rr.stderr), 'wait exits 4 on timeout');
  assert(Date.now() - t0 < 10_000, 'timeout is not stretched by the polling interval');
  rr = wait(['--applicationId', 'none', '--new', '--timeout', '0.05']);
  assert(rr.status === 4 && /No new deployment appeared/.test(rr.stderr), 'wait --new times out when nothing new starts');

  rr = spawnCli(['deployment', 'wait'], env);
  assert(rr.status === 1 && /exactly one of --applicationId or --composeId/.test(rr.stderr), 'wait requires one target');
  rr = spawnCli(['deployment', 'wait', '--applicationId', 'ok', '--bogus', 'x'], env);
  assert(rr.status === 1 && /Unknown flag/.test(rr.stderr), 'wait rejects unknown flags');
  rr = spawnCli(['deployment', 'wait', '--applicationId', 'ok', '--timeout', 'Infinity'], env);
  assert(rr.status === 1 && /--timeout must be a number/.test(rr.stderr), 'wait rejects a non-finite timeout');
  rr = spawnCli(['deployment'], env);
  assert(rr.status === 0 && /wait\s+\(client-side/.test(rr.stdout), 'deployment domain help lists wait');
  rr = spawnCli(['deployment', 'wait', '--help']);
  assert(rr.status === 0 && /Usage: dokploy deployment wait/.test(rr.stdout), 'wait --help works before login');
  rr = spawnCli([]);
  assert(/--composeId ID/.test(rr.stdout), 'top help shows the compose form of wait');
  rr = spawnCli(['deployment', 'wait', '--applicationId', 'ok']);
  assert(rr.status === 1 && /Not logged in/.test(rr.stderr), 'wait without auth exits 1');
  fake.kill();
}

// --- Summary -----------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`CLI Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
