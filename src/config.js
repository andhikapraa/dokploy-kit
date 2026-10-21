/**
 * Saved credentials for the CLI and the MCP server.
 *
 * `dokploy login` writes instances to a config file so agents launched from a
 * desktop app (which do not inherit shell env vars) still find them, and so the
 * setup is the same on macOS, Linux, and Windows.
 *
 * Resolution order (first match wins):
 *   1. DOKPLOY_INSTANCES env var (JSON array)
 *   2. DOKPLOY_BASE_URL (+ DOKPLOY_API_KEY) env vars
 *   3. The config file written by `dokploy login`
 *
 * Env vars stay first so existing setups and CI keep working unchanged.
 *
 * File: $DOKPLOY_CONFIG, else $XDG_CONFIG_HOME/dokploy/config.json,
 *       else ~/.config/dokploy/config.json (also on Windows: %USERPROFILE%\.config).
 *
 * Parse errors never include the raw JSON.parse message: V8 quotes part of the
 * input, which here can be an API key.
 * Shape: { "defaultInstance": "default", "instances": [{ name, baseUrl, apiKey }] }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function configPath() {
  if (process.env.DOKPLOY_CONFIG) return process.env.DOKPLOY_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'dokploy', 'config.json');
}

// Throws on malformed input; callers turn the message into their own exit path.
function validateInstances(list, source) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${source} must be a non-empty JSON array`);
  }
  const seen = new Set();
  for (const inst of list) {
    if (!inst || typeof inst !== 'object') {
      throw new Error(`Each ${source} entry must be an object`);
    }
    const missing = ['name', 'baseUrl', 'apiKey'].filter((k) => !inst[k]);
    if (missing.length > 0) {
      const label = inst.name ? `'${inst.name}'` : 'unnamed entry';
      throw new Error(`${source} ${label} is missing: ${missing.join(', ')}`);
    }
    if (seen.has(inst.name)) throw new Error(`Duplicate instance name: ${inst.name}`);
    seen.add(inst.name);
  }
  return list;
}

function readConfigFile(file = configPath()) {
  if (!fs.existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Invalid config file ${file}: not valid JSON. Fix it, or run \`dokploy logout\` and log in again.`);
  }
  validateInstances(parsed && parsed.instances, `config file ${file} "instances"`);
  return parsed;
}

/**
 * Resolve configured instances.
 * @returns {{ instances: Array<{name,baseUrl,apiKey}>, defaultInstance: string|undefined, source: string } | null}
 *   null when nothing is configured anywhere.
 */
function loadInstances() {
  const raw = process.env.DOKPLOY_INSTANCES;
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Invalid DOKPLOY_INSTANCES JSON: not a valid JSON array'); }
    return { instances: validateInstances(parsed, 'DOKPLOY_INSTANCES'), defaultInstance: undefined, source: 'env' };
  }
  const baseUrl = process.env.DOKPLOY_BASE_URL || '';
  if (baseUrl) {
    return {
      instances: [{ name: 'default', baseUrl, apiKey: process.env.DOKPLOY_API_KEY || '' }],
      defaultInstance: undefined,
      source: 'env',
    };
  }
  const file = readConfigFile();
  if (file) {
    return { instances: file.instances, defaultInstance: file.defaultInstance, source: 'file' };
  }
  return null;
}

/**
 * Add or replace one instance in the config file. The first saved instance
 * becomes the default. Written with mode 0600 inside a 0700 directory.
 */
function saveInstance(inst, { makeDefault = false } = {}) {
  const file = configPath();
  return withConfigLock(file, () => saveInstanceLocked(file, inst, makeDefault));
}

function saveInstanceLocked(file, inst, makeDefault) {
  const current = readConfigFile(file) || { instances: [] };
  const others = current.instances.filter((i) => i.name !== inst.name);
  const instances = [...others, { name: inst.name, baseUrl: inst.baseUrl, apiKey: inst.apiKey }];
  // Keep the existing default unless asked to switch or it no longer exists.
  const keepCurrent = !makeDefault && instances.some((i) => i.name === current.defaultInstance);
  const defaultInstance = keepCurrent ? current.defaultInstance : inst.name;
  writeConfigFile(file, { defaultInstance, instances });
  return { file, defaultInstance, instances };
}

// The only writer of the config file: 0700 directory, 0600 file. Writes a
// fresh 0600 temp file beside the target and renames it over, so readers never
// see a half-written file and an interrupted write cannot wipe saved logins.
function writeConfigFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  removeStaleTemps(file);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    // 'wx' fails if the name exists, so the 0600 mode always applies.
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// A hard kill between write and rename can leave `<config>.<pid>.<ms>.tmp`
// holding the key. Remove only temps whose writer process is gone, so a
// concurrent login's in-flight temp file is never deleted under it.
function removeStaleTemps(file) {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.`;
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const f of entries) {
    // Match only names writeConfigFile creates, so files like
    // `config.json.backup.tmp` are never touched.
    if (!f.startsWith(prefix)) continue;
    const m = /^(\d+)\.\d+\.tmp$/.exec(f.slice(prefix.length));
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid !== process.pid && isProcessAlive(pid)) continue;
    fs.rmSync(path.join(dir, f), { force: true });
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * Remove one instance, or all when name is omitted. Removing all deletes the
 * file even when it is corrupt, so a bad file never strands a key on disk.
 */
function removeInstance(name) {
  const file = configPath();
  return withConfigLock(file, () => removeInstanceLocked(file, name));
}

// Serialize read-modify-write across processes with an exclusive lock file, so
// two concurrent logins cannot both start from the same snapshot and drop one
// instance. A lock left by a dead process is taken over.
function withConfigLock(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner = NaN;
      try { owner = Number(fs.readFileSync(lock, 'utf8')); } catch { /* lock just released */ }
      if (!isProcessAlive(owner)) { fs.rmSync(lock, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`Config is locked by process ${owner} (${lock}). Retry, or delete the lock file if that process is gone.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

function removeInstanceLocked(file, name) {
  // Every logout path, including removing the last named instance, sweeps temps.
  removeStaleTemps(file);
  if (!name) {
    if (!fs.existsSync(file)) return { file, removed: [] };
    let removed = ['(unreadable config)'];
    try { removed = readConfigFile(file).instances.map((i) => i.name); } catch { /* still delete */ }
    fs.rmSync(file, { force: true });
    return { file, removed };
  }
  const current = readConfigFile(file);
  if (!current) return { file, removed: [] };
  const remaining = current.instances.filter((i) => i.name !== name);
  if (remaining.length === current.instances.length) return { file, removed: [] };
  if (remaining.length === 0) {
    fs.rmSync(file, { force: true });
  } else {
    const defaultInstance = current.defaultInstance === name ? remaining[0].name : current.defaultInstance;
    writeConfigFile(file, { defaultInstance, instances: remaining });
  }
  return { file, removed: [name] };
}

/**
 * Normalize a panel URL to the API base: accept "https://host", "https://host/",
 * "http://1.2.3.4:3000" or a URL that already ends in /api.
 */
function normalizeBaseUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error(`Not a valid URL: ${input}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`URL must start with http:// or https://`);
  const p = url.pathname.replace(/\/+$/, '');
  url.pathname = p.endsWith('/api') ? p : `${p}/api`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

module.exports = { configPath, validateInstances, readConfigFile, loadInstances, saveInstance, removeInstance, normalizeBaseUrl };
