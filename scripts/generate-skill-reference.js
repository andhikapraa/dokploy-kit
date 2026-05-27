#!/usr/bin/env node

/**
 * Generate skills/dokploy/reference.md from endpoints-parsed.json.
 * Run after `npm run parse` so the skill reference stays in sync with the API.
 */

const fs = require('fs');
const path = require('path');

const endpoints = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'endpoints-parsed.json'), 'utf-8')
);

const byTag = {};
for (const ep of endpoints) {
  for (const tag of ep.tags) {
    if (!byTag[tag]) byTag[tag] = [];
    const parts = ep.operationId.split('-');
    const action = parts.slice(1).join('-') || parts[0];
    byTag[tag].push({ action, method: ep.method, opId: ep.operationId });
  }
}

const lines = [];
lines.push('# Dokploy CLI — Domain Reference');
lines.push('');
lines.push('Auto-generated from `endpoints-parsed.json`. Do not edit by hand; run `npm run generate-skill-reference`.');
lines.push('');
lines.push(`${Object.keys(byTag).length} domains, ${endpoints.length} actions total.`);
lines.push('');
lines.push('Run `dokploy <domain> <action> --help` for parameter details on any specific action.');
lines.push('');

const sortedTags = Object.keys(byTag).sort();
for (const tag of sortedTags) {
  const actions = byTag[tag].sort((a, b) => a.action.localeCompare(b.action));
  lines.push(`## ${tag} (${actions.length})`);
  lines.push('');
  for (const a of actions) {
    lines.push(`- \`dokploy ${tag} ${a.action}\` — ${a.method} /${a.opId.replace(/-/g, '.')}`);
  }
  lines.push('');
}

const outPath = path.join(__dirname, '..', 'skills', 'dokploy', 'reference.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'));
process.stdout.write(`Wrote ${outPath} (${endpoints.length} actions across ${sortedTags.length} domains)\n`);
