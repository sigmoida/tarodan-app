/**
 * CI gate (run via `typecheck`): (1) tr and en must have identical key sets,
 * (2) the generated MessageKey union must be up to date. Either failure exits
 * non-zero so the shared catalog can never drift or ship stale types.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildKeysFile, flatten } from './gen-keys.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(resolve(here, '../src/catalog', f), 'utf8'));

let failed = false;

// 1) tr/en parity
const trKeys = flatten(load('tr.json')).sort();
const enKeys = flatten(load('en.json')).sort();
const trSet = new Set(trKeys);
const enSet = new Set(enKeys);
const trOnly = trKeys.filter((k) => !enSet.has(k));
const enOnly = enKeys.filter((k) => !trSet.has(k));
if (trOnly.length || enOnly.length) {
  failed = true;
  console.error(`✗ tr/en key parity broken.`);
  if (trOnly.length) console.error(`  in tr, missing in en (${trOnly.length}): ${trOnly.slice(0, 20).join(', ')}`);
  if (enOnly.length) console.error(`  in en, missing in tr (${enOnly.length}): ${enOnly.slice(0, 20).join(', ')}`);
} else {
  console.log(`✓ tr/en parity OK (${trKeys.length} keys)`);
}

// 2) generated keys freshness
const committed = readFileSync(resolve(here, '../src/generated/keys.ts'), 'utf8');
if (committed !== buildKeysFile()) {
  failed = true;
  console.error('✗ generated MessageKey union is stale. Run: pnpm --filter @tarodan/i18n codegen');
} else {
  console.log('✓ generated MessageKey union up to date');
}

process.exit(failed ? 1 : 0);
