#!/usr/bin/env node

/**
 * Dokploy CLI — thin wrapper over the Dokploy API.
 *
 * Designed to be driven by a Claude Skill rather than as an MCP server, so
 * tool schemas don't sit in context. Help text is discovered on demand:
 *
 *   dokploy --list                       # list all domains
 *   dokploy <domain>                     # list actions in a domain
 *   dokploy <domain> <action> --help     # show params for an action
 *   dokploy instances                    # list configured instances
 *
 * Auth: DOKPLOY_API_KEY + DOKPLOY_BASE_URL, or DOKPLOY_INSTANCES + --instance.
 *
 * Behavioral parity with src/index.js (the MCP server):
 *   - Body fields named `action` or `instance` are exposed as `--param_action`
 *     / `--param_instance` to avoid collision with routing args (mirrors the
 *     MCP's `param_*` renaming in tool-generator.js + index.js).
 *   - Multi-instance: when >1 instance is configured, `--instance NAME` picks
 *     one; configured names are surfaced in `dokploy --help` so they can be
 *     discovered without an API call. With 1 instance, `--instance` is hidden.
 *   - Duplicate instance names are rejected at startup (matches MCP).
 */

const path = require('path');
const fs = require('fs');
const { DokployClient } = require('./api-client.js');

const ENDPOINTS_PATH = path.join(__dirname, '..', 'endpoints-parsed.json');

// Reserved CLI arg names that would collide with routing/global flags.
// A Dokploy body field named `action` or `instance` is exposed as
// `--param_action` / `--param_instance` on the CLI surface, but sent to
// the API under its original name. Matches src/index.js:128-130.
const CLI_RESERVED = new Set(['action', 'instance']);
const cliFlagFor = (rawName) => (CLI_RESERVED.has(rawName) ? `param_${rawName}` : rawName);

function loadEndpoints() {
  if (!fs.existsSync(ENDPOINTS_PATH)) {
    fail('endpoints-parsed.json not found. Run `npm run parse`.');
  }
  return JSON.parse(fs.readFileSync(ENDPOINTS_PATH, 'utf-8'));
}

function actionOf(operationId) {
  const parts = operationId.split('-');
  return parts.slice(1).join('-') || parts[0];
}

function buildIndex(endpoints) {
  const byTag = {};
  for (const ep of endpoints) {
    for (const tag of ep.tags) {
      if (!byTag[tag]) byTag[tag] = {};
      byTag[tag][actionOf(ep.operationId)] = ep;
    }
  }
  return byTag;
}

/**
 * Parse + validate DOKPLOY_INSTANCES (or fall back to single-instance vars).
 * Rejects duplicate names — matches src/index.js:42-46.
 */
function parseInstances() {
  const raw = process.env.DOKPLOY_INSTANCES;
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { fail(`Invalid DOKPLOY_INSTANCES JSON: ${e.message}`); }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      fail('DOKPLOY_INSTANCES must be a non-empty JSON array');
    }
    const seen = new Set();
    for (const inst of parsed) {
      if (!inst || typeof inst !== 'object') {
        fail('Each DOKPLOY_INSTANCES entry must be an object');
      }
      const missing = ['name', 'baseUrl', 'apiKey'].filter((k) => !inst[k]);
      if (missing.length > 0) {
        const label = inst.name ? `'${inst.name}'` : 'unnamed entry';
        fail(`DOKPLOY_INSTANCES ${label} is missing: ${missing.join(', ')}`);
      }
      if (seen.has(inst.name)) {
        fail(`Duplicate instance name: ${inst.name}`);
      }
      seen.add(inst.name);
    }
    return parsed;
  }
  const apiKey = process.env.DOKPLOY_API_KEY || '';
  const baseUrl = process.env.DOKPLOY_BASE_URL || '';
  if (!baseUrl) fail('Set DOKPLOY_BASE_URL (or DOKPLOY_INSTANCES).');
  return [{ name: 'default', baseUrl, apiKey }];
}

function resolveDefault(instances) {
  const requested = process.env.DOKPLOY_DEFAULT_INSTANCE;
  if (requested && !instances.some((i) => i.name === requested)) {
    fail(`DOKPLOY_DEFAULT_INSTANCE='${requested}' not found in DOKPLOY_INSTANCES`);
  }
  return requested || instances[0].name;
}

function pickClient(instances, defaultInstance, requestedName) {
  const name = requestedName || defaultInstance;
  const inst = instances.find((i) => i.name === name);
  if (!inst) {
    fail(`Unknown instance '${name}'. Configured: ${instances.map((i) => i.name).join(', ')}`);
  }
  return new DokployClient(inst.baseUrl, inst.apiKey);
}

/**
 * Parse argv into { globalFlags, positional, flags }.
 * Global flags (--instance) consumed before positional args.
 * Flags after positional accept either `--k v` or `--k=v`.
 * Repeated `--k` becomes an array. Bare `--flag` is boolean true.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const globalFlags = {};
  const positional = [];
  const flags = {};

  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    if (a === '--help' || a === '-h') { flags.help = true; i++; continue; }
    if (a === '--list') { flags.list = true; i++; continue; }
    if (a === '--instance' && args[i + 1]) { globalFlags.instance = args[i + 1]; i += 2; continue; }
    if (a.startsWith('--instance=')) { globalFlags.instance = a.slice('--instance='.length); i++; continue; }
    break;
  }
  while (i < args.length && !args[i].startsWith('-')) {
    positional.push(args[i]);
    i++;
  }
  while (i < args.length) {
    const a = args[i];
    if (a === '--help' || a === '-h') { flags.help = true; i++; continue; }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let value;
      if (key.includes('=')) {
        const eq = key.indexOf('=');
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
        value = args[i + 1];
        i++;
      } else {
        value = true;
      }
      if (flags[key] !== undefined) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
      } else {
        flags[key] = value;
      }
      i++;
    } else {
      i++;
    }
  }
  return { globalFlags, positional, flags };
}

function coerce(value, schema) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return value;
  if (/^[\[{]/.test(value)) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (!schema) return value;
  const type = schema.type;
  if (type === 'boolean') return value === '1';
  if (type === 'number' || type === 'integer') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (type === 'array') {
    return value.split(',').map((s) => s.trim());
  }
  return value;
}

function describeSchema(schema) {
  if (!schema) return 'any';
  if (schema.enum) return `enum(${schema.enum.join('|')})`;
  if (schema.type === 'array') {
    const items = schema.items ? describeSchema(schema.items) : 'any';
    return `array<${items}>`;
  }
  return schema.type || 'any';
}

function printTopHelp(index, instances, defaultInstance) {
  const domains = Object.keys(index).sort();
  const multi = instances.length > 1;

  const usageLine = multi
    ? '  dokploy [--instance NAME] <domain> <action> [--key value ...]'
    : '  dokploy <domain> <action> [--key value ...]';

  let authSection;
  if (multi) {
    const lines = instances.map((i) => {
      const tag = i.name === defaultInstance ? ' (default)' : '';
      return `    ${i.name}${tag} → ${i.baseUrl}`;
    }).join('\n');
    authSection =
`Configured instances (${instances.length}):
${lines}

Pass --instance NAME to target one. Omit it to use '${defaultInstance}'.
Run \`dokploy instances\` for machine-readable JSON.`;
  } else {
    authSection =
`Single-instance mode. Set DOKPLOY_INSTANCES (JSON array) to use multiple Dokploy installs.
Configured: ${instances[0].name} → ${instances[0].baseUrl}`;
  }

  process.stdout.write(
`dokploy — CLI for Dokploy API

Usage:
${usageLine}
  dokploy --list                       List all domains
  dokploy <domain>                     List actions in a domain
  dokploy <domain> <action> --help     Show params for an action
  dokploy instances                    List configured instances (JSON)

Auth:
${authSection}

Value coercion:
  Strings are passed through. Use --key=true / --key=42 for typed scalars.
  Use --key '[1,2]' or --key '{"a":1}' for JSON arrays/objects.
  Repeating --key promotes to an array.

Domains (${domains.length}):
${domains.map((d) => `  ${d}`).join('\n')}

Run \`dokploy <domain>\` to see its actions.
`);
}

function printDomainHelp(domain, actions) {
  const names = Object.keys(actions).sort();
  process.stdout.write(
`Domain: ${domain}

Actions (${names.length}):
${names.map((a) => `  ${a}  (${actions[a].method} /${actions[a].operationId.replace(/-/g, '.')})`).join('\n')}

Run \`dokploy ${domain} <action> --help\` for parameter details.
`);
}

function printActionHelp(domain, action, ep) {
  const queryParams = ep.params.filter((p) => p.in !== 'path');
  const pathParams = ep.params.filter((p) => p.in === 'path');
  const bodyEntries = Object.entries(ep.bodyProps || {});
  const bodyRequired = new Set(ep.bodyRequired || []);

  const lines = [];
  lines.push(`${domain} ${action}`);
  lines.push(`  ${ep.method} /${ep.operationId.replace(/-/g, '.')}`);
  lines.push('');

  const renameNote = (raw) => {
    const flag = cliFlagFor(raw);
    return flag === raw ? '' : `  [API field: ${raw}]`;
  };

  if (queryParams.length > 0) {
    lines.push('Query params:');
    for (const p of queryParams) {
      const req = p.required ? ' (required)' : '';
      const desc = p.schema?.description ? ` — ${p.schema.description}` : '';
      lines.push(`  --${cliFlagFor(p.name)}  ${describeSchema(p.schema)}${req}${desc}${renameNote(p.name)}`);
    }
    lines.push('');
  }
  if (pathParams.length > 0) {
    lines.push('Path params (sent as query):');
    for (const p of pathParams) {
      const req = p.required ? ' (required)' : '';
      lines.push(`  --${cliFlagFor(p.name)}  ${describeSchema(p.schema)}${req}${renameNote(p.name)}`);
    }
    lines.push('');
  }
  if (bodyEntries.length > 0) {
    lines.push('Body params:');
    for (const [name, sch] of bodyEntries) {
      const req = bodyRequired.has(name) ? ' (required)' : '';
      const desc = sch?.description ? ` — ${sch.description}` : '';
      lines.push(`  --${cliFlagFor(name)}  ${describeSchema(sch)}${req}${desc}${renameNote(name)}`);
    }
    lines.push('');
  }
  if (queryParams.length + pathParams.length + bodyEntries.length === 0) {
    lines.push('(no parameters)');
  }
  process.stdout.write(lines.join('\n') + '\n');
}

function printInstances(instances, defaultInstance) {
  const out = instances.map((i) => ({
    name: i.name,
    baseUrl: i.baseUrl,
    isDefault: i.name === defaultInstance,
  }));
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

function fail(msg, code = 1) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(code);
}

async function main() {
  const endpoints = loadEndpoints();
  const index = buildIndex(endpoints);
  const { globalFlags, positional, flags } = parseArgs(process.argv);

  // Resolve instances early so help text and validation can reference them.
  const instances = parseInstances();
  const defaultInstance = resolveDefault(instances);
  if (globalFlags.instance && !instances.some((i) => i.name === globalFlags.instance)) {
    fail(`Unknown instance '${globalFlags.instance}'. Configured: ${instances.map((i) => i.name).join(', ')}`);
  }

  // `dokploy --list` → bare domain names, one per line.
  if (flags.list) {
    for (const d of Object.keys(index).sort()) process.stdout.write(`${d}\n`);
    return;
  }

  // No positional → top-level help (also covers `dokploy --help`).
  if (positional.length === 0) {
    printTopHelp(index, instances, defaultInstance);
    return;
  }

  // `dokploy instances` → JSON listing of configured instances.
  if (positional[0] === 'instances' && positional.length === 1) {
    printInstances(instances, defaultInstance);
    return;
  }

  const [domain, action] = positional;
  const domainActions = index[domain];
  if (!domainActions) fail(`Unknown domain '${domain}'. Run \`dokploy --list\`.`);

  if (!action) {
    printDomainHelp(domain, domainActions);
    return;
  }

  const ep = domainActions[action];
  if (!ep) {
    fail(`Unknown action '${action}' for domain '${domain}'. Run \`dokploy ${domain}\`.`);
  }

  if (flags.help) {
    printActionHelp(domain, action, ep);
    return;
  }

  // Build query + body from flags. Reserved field names (`action`, `instance`)
  // are read from `--param_*` on the CLI but sent under their original name.
  const queryParams = {};
  for (const p of ep.params) {
    const flagName = cliFlagFor(p.name);
    if (flags[flagName] !== undefined) {
      queryParams[p.name] = coerce(flags[flagName], p.schema);
    }
  }
  let body = null;
  if (ep.hasBody) {
    body = {};
    for (const [name, sch] of Object.entries(ep.bodyProps || {})) {
      const flagName = cliFlagFor(name);
      if (flags[flagName] !== undefined) {
        body[name] = coerce(flags[flagName], sch);
      }
    }
  }

  const missing = [];
  for (const p of ep.params) {
    if (p.required && queryParams[p.name] === undefined) missing.push(cliFlagFor(p.name));
  }
  for (const name of ep.bodyRequired || []) {
    if (!body || body[name] === undefined) missing.push(cliFlagFor(name));
  }
  if (missing.length > 0) {
    fail(`Missing required parameter(s): ${missing.map((m) => `--${m}`).join(', ')}\n       See: dokploy ${domain} ${action} --help`);
  }

  const client = pickClient(instances, defaultInstance, globalFlags.instance);
  try {
    const apiPath = `/${ep.operationId.replace(/-/g, '.')}`;
    const result = await client.request(apiPath, ep.method, queryParams, body);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    fail(e.message, 2);
  }
}

main().catch((e) => fail(e.stack || e.message));
