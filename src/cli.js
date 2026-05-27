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
 *   - Query OR body params named `action` or `instance` are exposed as
 *     `--param_action` / `--param_instance` to avoid collision with routing
 *     args (mirrors the MCP's `param_*` renaming in tool-generator.js +
 *     index.js). Today this is exercised by `auditLog all`, whose `action`
 *     query param is reached via `dokploy auditLog all --param_action ...`.
 *   - Multi-instance: when >1 instance is configured, `--instance NAME` picks
 *     one; configured names are surfaced in `dokploy --help` so they can be
 *     discovered without an API call. With 1 instance, `--instance` is hidden.
 *     `--instance` is accepted in any position (before or after positional args).
 *   - Duplicate instance names are rejected at startup (matches MCP).
 *   - Unknown flags are rejected with a list and `--help` pointer.
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
 * Parse argv into { globalFlags, positional, flags, error? }.
 *
 * --instance is accepted in any position (before or after positional args)
 * and always lands in globalFlags. Specifying it twice with conflicting
 * values returns an error rather than silently picking one. This prevents
 * the silent default-instance routing of trailing `--instance` that an
 * earlier version had: `dokploy project remove --projectId X --instance staging`
 * used to ignore the `--instance` and run against the default instance.
 *
 * Other flags: --k v / --k=v / bare --k (boolean true). Repeated --k → array.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const globalFlags = {};
  const positional = [];
  const flags = {};

  const setInstance = (value) => {
    if (globalFlags.instance !== undefined && globalFlags.instance !== value) {
      return `--instance specified twice with conflicting values: '${globalFlags.instance}' and '${value}'`;
    }
    globalFlags.instance = value;
    return null;
  };

  // Consume one token (or two for `--k v`). Returns { advance, error? }.
  const consumeFlag = (a, next) => {
    if (a === '--help' || a === '-h') { flags.help = true; return { advance: 1 }; }
    if (a === '--list') { flags.list = true; return { advance: 1 }; }
    if (a === '--instance') {
      if (next === undefined || next.startsWith('--')) {
        return { advance: 1, error: '--instance requires a value' };
      }
      const err = setInstance(next);
      return { advance: 2, error: err };
    }
    if (a.startsWith('--instance=')) {
      const value = a.slice('--instance='.length);
      if (value === '') return { advance: 1, error: '--instance= requires a value' };
      const err = setInstance(value);
      return { advance: 1, error: err };
    }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let value;
      let advance = 1;
      if (key.includes('=')) {
        const eq = key.indexOf('=');
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (next !== undefined && !next.startsWith('--')) {
        value = next;
        advance = 2;
      } else {
        value = true;
      }
      if (flags[key] !== undefined) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
      } else {
        flags[key] = value;
      }
      return { advance };
    }
    // Single-dash tokens (-x, -foo, etc.) — silently swallowed before. Reject
    // explicitly so typos like `dokploy -x project all` don't get dropped.
    if (a.startsWith('-')) {
      return { advance: 1, error: `Unknown flag '${a}' (use --<name> form; -h is the only single-dash alias, for --help)` };
    }
    return { advance: 1 };
  };

  let i = 0;
  // Phase 1: leading flags (before positional)
  while (i < args.length && args[i].startsWith('-')) {
    const { advance, error } = consumeFlag(args[i], args[i + 1]);
    if (error) return { globalFlags, positional, flags, error };
    i += advance;
  }
  // Phase 2: positional
  while (i < args.length && !args[i].startsWith('-')) {
    positional.push(args[i]);
    i++;
  }
  // Phase 3: trailing flags + bare tokens. --instance still routes to globalFlags.
  // Bare non-flag tokens here are extra positional — capture them so the
  // extra-positional guard in main() catches them rather than silently dropping.
  while (i < args.length) {
    if (!args[i].startsWith('-')) {
      positional.push(args[i]);
      i++;
      continue;
    }
    const { advance, error } = consumeFlag(args[i], args[i + 1]);
    if (error) return { globalFlags, positional, flags, error };
    i += advance;
  }
  return { globalFlags, positional, flags };
}

/**
 * Resolve an OpenAPI schema to its effective primitive type, walking through
 * `anyOf`/`oneOf` wrappers and discarding null variants. Mirrors the MCP's
 * tool-generator.js openApiToZod logic so CLI coercion matches MCP behavior on
 * nullable fields (e.g. domain.create.port = anyOf[number, null]).
 *
 * Returns one of: 'string' | 'number' | 'integer' | 'boolean' | 'array' |
 * 'object' | null (when the type can't be resolved unambiguously).
 */
function effectiveType(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.type && schema.type !== 'null') return schema.type;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const t = typeof schema.enum[0];
    if (t === 'string' || t === 'number' || t === 'boolean') return t;
  }
  const variants = schema.anyOf || schema.oneOf;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter((v) => v && v.type !== 'null');
    if (nonNull.length === 0) return null;
    if (nonNull.length === 1) return effectiveType(nonNull[0]);
    const types = nonNull.map((v) => effectiveType(v));
    const unique = [...new Set(types.filter((t) => t !== null))];
    if (unique.length === 1) return unique[0];
    // Mixed primitives (e.g. string + number) — can't safely coerce.
    return null;
  }
  return null;
}

function isNullable(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.nullable === true) return true;
  const variants = schema.anyOf || schema.oneOf;
  if (Array.isArray(variants)) {
    return variants.some((v) => v && v.type === 'null');
  }
  return false;
}

// Tight number regex — rejects hex (0x10), scientific (5e10), whitespace, Infinity.
// JavaScript's Number() accepts all of those, which silently sends surprising
// numeric values when the user typed something that looks like a typo.
const NUMERIC_LITERAL = /^-?(\d+\.?\d*|\.\d+)$/;

function coerce(value, schema) {
  if (value === true || value === false) return value;

  const type = effectiveType(schema);

  // Arrays-in: repeated flags (`--port 80 --port 443`) arrive at coerce as
  // string arrays. Coerce each item against schema.items so array<number>
  // doesn't ship as ["80","443"].
  if (Array.isArray(value)) {
    if (type === 'array' && schema && schema.items) {
      return value.map((item) => coerce(item, schema.items));
    }
    return value;
  }

  if (typeof value !== 'string') return value;

  // Honor the literal 'null' first for any nullable schema. Earlier this only
  // worked for string fields, so `--port null` on a nullable number was
  // rejected by validateValue.
  if (value === 'null' && isNullable(schema)) return null;

  // No schema → fall back to permissive legacy parsing. Used by ad-hoc callers
  // (tests) that pass raw values without a schema.
  if (!type) {
    if (/^[\[{]/.test(value)) {
      try { return JSON.parse(value); } catch { /* fall through */ }
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    return value;
  }

  // Schema-aware: only JSON-parse when the schema actually expects structured
  // data. Otherwise `--name '[1,2,3]'` would silently send an array where the
  // API expects a string.
  if (type === 'array' || type === 'object') {
    if (/^[\[{]/.test(value)) {
      try {
        const parsed = JSON.parse(value);
        if (type === 'array' && Array.isArray(parsed) && schema && schema.items) {
          return parsed.map((item) => coerce(item, schema.items));
        }
        return parsed;
      } catch { /* fall through */ }
    }
    if (type === 'array') {
      const parts = value.split(',').map((s) => s.trim());
      if (schema && schema.items) return parts.map((item) => coerce(item, schema.items));
      return parts;
    }
    return value;
  }

  if (type === 'boolean') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value; // let validateValue flag the mismatch
  }

  if (type === 'number' || type === 'integer') {
    if (!NUMERIC_LITERAL.test(value)) return value;
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    if (type === 'integer' && !Number.isInteger(n)) return value;
    return n;
  }

  return value;
}

function describeSchema(schema) {
  if (!schema) return 'any';
  if (schema.enum) return `enum(${schema.enum.join('|')})`;
  const type = effectiveType(schema);
  if (type === 'array') {
    const items = schema.items ? describeSchema(schema.items) : 'any';
    return `array<${items}>${isNullable(schema) ? '?' : ''}`;
  }
  if (type) return `${type}${isNullable(schema) ? '?' : ''}`;
  return 'any';
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

/**
 * Validate a coerced value against its schema. Returns an error string or null.
 *
 * Catches three classes of silent-wrong inputs the earlier code accepted:
 *   1. `--https tru` — coerce can't parse 'tru' as boolean, validator flags it.
 *   2. `--name --description API` — bare `--name` becomes true, but the field
 *      expects a string; validator flags the type mismatch.
 *   3. `--certificateType bogus` — value isn't in the schema's enum.
 */
/**
 * Walk a schema (anyOf-aware) and return the first variant carrying a given
 * keyword (e.g. 'minLength', 'minimum'). Mirrors what openApiToZod does when
 * it folds anyOf[primitive, null] down to a single typed schema.
 */
function findConstraint(schema, key) {
  if (!schema || typeof schema !== 'object') return undefined;
  if (schema[key] !== undefined) return schema[key];
  const variants = schema.anyOf || schema.oneOf;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v && v.type !== 'null') {
        const found = findConstraint(v, key);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function validateValue(coerced, raw, schema, flagName) {
  if (!schema || typeof schema !== 'object') return null;

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.includes(coerced)) {
    return `--${flagName}: expected one of [${schema.enum.join('|')}], got ${JSON.stringify(coerced)}`;
  }

  const type = effectiveType(schema);
  if (!type) return null;

  // null permitted when the schema is nullable (anyOf includes {type:'null'}).
  if (coerced === null) {
    return isNullable(schema) ? null : `--${flagName}: expected ${type}, got null`;
  }

  // Bare flag (`--foo` with no value) lands as boolean true. Allowed only when
  // the field's actual type is boolean.
  if (raw === true && type !== 'boolean') {
    return `--${flagName}: expected ${type} value (bare --${flagName} with no value parses as true)`;
  }

  if (type === 'string' && typeof coerced !== 'string') {
    return `--${flagName}: expected string, got ${JSON.stringify(coerced)}`;
  }
  if (type === 'boolean' && typeof coerced !== 'boolean') {
    return `--${flagName}: expected true/false, got ${JSON.stringify(coerced)}`;
  }
  if ((type === 'number' || type === 'integer') && typeof coerced !== 'number') {
    return `--${flagName}: expected ${type}, got ${JSON.stringify(coerced)}`;
  }
  if (type === 'object') {
    if (typeof coerced !== 'object' || Array.isArray(coerced)) {
      return `--${flagName}: expected object, got ${JSON.stringify(coerced)}`;
    }
    // Walk required properties and validate each, matching what the MCP's
    // openApiToZod produces via z.object(shape) with .required(). Without
    // this, --metricsConfig '{}' would slip past when the API needs nested
    // fields like server/containers.
    if (Array.isArray(schema.required)) {
      for (const prop of schema.required) {
        if (coerced[prop] === undefined) {
          return `--${flagName}: missing required property '${prop}'`;
        }
      }
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (coerced[prop] !== undefined) {
          const propErr = validateValue(coerced[prop], coerced[prop], propSchema, `${flagName}.${prop}`);
          if (propErr) return propErr;
        }
      }
    }
  }
  if (type === 'array' && !Array.isArray(coerced)) {
    return `--${flagName}: expected array, got ${JSON.stringify(coerced)}`;
  }

  // Schema constraints — mirror what the MCP's openApiToZod enforces via Zod
  // .min()/.max(). Without these, bad values reach the API and bounce as 400.
  if (type === 'string') {
    const minLength = findConstraint(schema, 'minLength');
    if (minLength !== undefined && coerced.length < minLength) {
      return `--${flagName}: expected length ≥ ${minLength}, got ${coerced.length}`;
    }
    const maxLength = findConstraint(schema, 'maxLength');
    if (maxLength !== undefined && coerced.length > maxLength) {
      return `--${flagName}: expected length ≤ ${maxLength}, got ${coerced.length}`;
    }
  }
  if (type === 'number' || type === 'integer') {
    const minimum = findConstraint(schema, 'minimum');
    if (minimum !== undefined && coerced < minimum) {
      return `--${flagName}: expected ≥ ${minimum}, got ${coerced}`;
    }
    const maximum = findConstraint(schema, 'maximum');
    if (maximum !== undefined && coerced > maximum) {
      return `--${flagName}: expected ≤ ${maximum}, got ${coerced}`;
    }
  }
  if (type === 'array') {
    const minItems = findConstraint(schema, 'minItems');
    if (minItems !== undefined && coerced.length < minItems) {
      return `--${flagName}: expected ≥ ${minItems} items, got ${coerced.length}`;
    }
    const maxItems = findConstraint(schema, 'maxItems');
    if (maxItems !== undefined && coerced.length > maxItems) {
      return `--${flagName}: expected ≤ ${maxItems} items, got ${coerced.length}`;
    }
    if (schema.items) {
      for (let i = 0; i < coerced.length; i++) {
        const itemErr = validateValue(coerced[i], coerced[i], schema.items, `${flagName}[${i}]`);
        if (itemErr) return itemErr;
      }
    }
  }

  return null;
}

/**
 * Translate CLI flags into the API request shape for a single endpoint.
 *
 * Returns { queryParams, body, missing, errors }:
 *   - queryParams: Record<paramName, coercedValue> for params declared on the endpoint
 *   - body: Record<propName, coercedValue> when ep.hasBody, else null
 *   - missing: array of CLI flag names (post-rename, e.g. 'param_action') for
 *     required slots that weren't supplied
 *   - errors: array of validation error strings for flags whose values can't
 *     be coerced to the schema's expected type
 *
 * Reserved field names (`action` / `instance`) are read from the CLI under
 * `--param_*` (per cliFlagFor) but placed into the request payload under their
 * original name — matches the MCP server's argKeyFor in src/index.js:128-130.
 *
 * Pure function so it's unit-testable without spawning the CLI or hitting the network.
 */
function assembleRequest(ep, flags) {
  const queryParams = {};
  const errors = [];

  for (const p of ep.params) {
    const flagName = cliFlagFor(p.name);
    if (flags[flagName] !== undefined) {
      const raw = flags[flagName];
      const v = coerce(raw, p.schema);
      const err = validateValue(v, raw, p.schema, flagName);
      if (err) errors.push(err);
      else queryParams[p.name] = v;
    }
  }
  let body = null;
  if (ep.hasBody) {
    body = {};
    for (const [name, sch] of Object.entries(ep.bodyProps || {})) {
      const flagName = cliFlagFor(name);
      if (flags[flagName] !== undefined) {
        const raw = flags[flagName];
        const v = coerce(raw, sch);
        const err = validateValue(v, raw, sch, flagName);
        if (err) errors.push(err);
        else body[name] = v;
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
  return { queryParams, body, missing, errors };
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
  const parsed = parseArgs(process.argv);
  if (parsed.error) fail(parsed.error);
  const { globalFlags, positional, flags } = parsed;

  // Resolve instances early so help text and validation can reference them.
  const instances = parseInstances();
  const defaultInstance = resolveDefault(instances);
  if (globalFlags.instance && !instances.some((i) => i.name === globalFlags.instance)) {
    fail(`Unknown instance '${globalFlags.instance}'. Configured: ${instances.map((i) => i.name).join(', ')}`);
  }

  // `dokploy --list` → bare domain names, one per line.
  // Reject when combined with a domain/action to keep fail-loudly behavior.
  if (flags.list) {
    if (positional.length > 0) {
      fail(`--list cannot be combined with positional arguments (${positional.join(' ')})`);
    }
    for (const d of Object.keys(index).sort()) process.stdout.write(`${d}\n`);
    return;
  }

  // No positional → top-level help (also covers `dokploy --help`).
  if (positional.length === 0) {
    printTopHelp(index, instances, defaultInstance);
    return;
  }

  // `dokploy instances` → JSON listing of configured instances.
  if (positional[0] === 'instances') {
    if (positional.length > 1) {
      fail(`Unexpected arguments after 'instances': ${positional.slice(1).join(' ')}`);
    }
    printInstances(instances, defaultInstance);
    return;
  }

  // Reject extra positional tokens — `dokploy project create extra --name foo`
  // used to silently drop 'extra' and proceed.
  if (positional.length > 2) {
    fail(
      `Unexpected extra argument(s): ${positional.slice(2).join(' ')}\n` +
      `       Usage: dokploy [--instance NAME] <domain> <action> [--key value ...]`
    );
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

  // Reject unknown flags so typos (`--httpss`) or stale skill instructions
  // fail loudly instead of silently dropping the value. `--list` is handled
  // (and errored) before reaching here, so it's not in the allowlist.
  const expectedFlags = new Set(['help']);
  for (const p of ep.params) expectedFlags.add(cliFlagFor(p.name));
  for (const name of Object.keys(ep.bodyProps || {})) expectedFlags.add(cliFlagFor(name));
  const unknown = Object.keys(flags).filter((k) => !expectedFlags.has(k));
  if (unknown.length > 0) {
    fail(
      `Unknown flag(s): ${unknown.map((k) => `--${k}`).join(', ')}\n` +
      `       See: dokploy ${domain} ${action} --help`
    );
  }

  const { queryParams, body, missing, errors } = assembleRequest(ep, flags);
  if (errors.length > 0) {
    fail(
      `Invalid value(s):\n  ${errors.join('\n  ')}\n` +
      `       See: dokploy ${domain} ${action} --help`
    );
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

if (require.main === module) {
  main().catch((e) => fail(e.stack || e.message));
}

module.exports = {
  CLI_RESERVED,
  cliFlagFor,
  actionOf,
  buildIndex,
  parseInstances,
  resolveDefault,
  parseArgs,
  coerce,
  effectiveType,
  isNullable,
  assembleRequest,
  validateValue,
  findConstraint,
};
