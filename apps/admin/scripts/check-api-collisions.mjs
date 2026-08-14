#!/usr/bin/env node
/**
 * Guards the split admin API surface (src/lib/api/*): every method name must be
 * unique across the domain modules, because index.ts recomposes them with object
 * spread and a later module would silently shadow an earlier one's method.
 *
 * Extracts top-level object keys from each module (one indent level, tab- or
 * space-based, so it survives reformatting) and fails if any name appears twice.
 * Run: `node scripts/check-api-collisions.mjs` (wired into `pnpm test:api`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'api');

// client.ts holds the axios instance/interceptor, not adminApi methods — skip it.
const SKIP = new Set(['client.ts']);
// `*.types.ts` carries request/response shapes for a domain module, not adminApi
// methods. Their interface fields sit at one indent too, so without this they'd
// be read as method names and collide with each other (`resource`, `id`, …).
const isTypeModule = (file) => file.endsWith('.types.ts');
// One indent unit (2 spaces or 1 tab) + identifier + `:` or `(` → a top-level key.
const KEY = /^(?:  |\t)([A-Za-z_$][\w$]*)\s*[:(]/;

const owners = new Map(); // name -> [files]

for (const file of readdirSync(apiDir)) {
  if (!file.endsWith('.ts') || SKIP.has(file) || isTypeModule(file)) continue;
  const lines = readFileSync(join(apiDir, file), 'utf8').split('\n');
  for (const line of lines) {
    const m = KEY.exec(line);
    if (!m) continue;
    const name = m[1];
    if (!owners.has(name)) owners.set(name, []);
    owners.get(name).push(file);
  }
}

const collisions = [...owners.entries()].filter(([, files]) => files.length > 1);

if (collisions.length) {
  console.error(`✗ ${collisions.length} duplicate admin API method name(s):`);
  for (const [name, files] of collisions) {
    console.error(`  - ${name}: ${files.join(', ')}`);
  }
  process.exit(1);
}

console.log(`✓ ${owners.size} admin API methods, all names unique.`);
