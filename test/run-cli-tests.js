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

section('Integration: missing auth env');
r = spawnCli(['--list']);  // no env
assert(r.status === 1, 'missing DOKPLOY_BASE_URL exits 1');
assert(r.stderr.includes('DOKPLOY_BASE_URL'), 'error mentions the missing var');

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

// --- Summary -----------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`CLI Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
