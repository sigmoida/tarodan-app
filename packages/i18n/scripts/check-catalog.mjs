/**
 * CI gate (run via `typecheck`): (1) tr and en must have identical key sets,
 * (2) the generated MessageKey union must be up to date, (3) no catalog value
 * may hold an emoji, pictograph or decorative symbol or arrow (visual cues come
 * from design-system icons, not text). Any failure exits
 * non-zero so the shared catalog can never drift or ship stale types.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildKeysFile, flatten } from './gen-keys.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(resolve(here, '../src/catalog', f), 'utf8'));

// Extended_Pictographic covers emoji (also the dingbats like check/cross/warning
// and the high-voltage sign); the rest are text-style symbols, the Arrows block
// and ASCII arrows. The legal marks (c), (r) and (tm) are Extended_Pictographic
// too but are typography, so they stay allowed. A navigation path is written
// with " > " ("Profile > Addresses"), a pairing in words ("2 items for 3 items").
// The API applies the same rule to server-rendered text in
// apps/api/src/common/helpers/pictograph.ts.
const FORBIDDEN_GLYPH =
  /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|[\u2605\u2606\u2713\u2714\u2715\u2717\u2190-\u21FF\uFE0F]|->|<-|=>/u;

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

// 3) no emoji / pictographs / decorative symbols or arrows in copy
const checkNoPictographs = (f) => {
  const offenders = [];
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof v === 'object' && v !== null) walk(v, p);
      else if (typeof v === 'string' && FORBIDDEN_GLYPH.test(v)) offenders.push(p);
    }
  };
  walk(load(f), '');
  return offenders;
};
const glyphOffenders = ['tr.json', 'en.json'].flatMap((f) =>
  checkNoPictographs(f).map((k) => `${f.replace('.json', '')}:${k}`),
);
if (glyphOffenders.length) {
  failed = true;
  console.error(`✗ emoji/pictograph/arrow found in ${glyphOffenders.length} catalog value(s); use design-system icons instead:`);
  for (const o of glyphOffenders.slice(0, 30)) console.error(`  ${o}`);
} else {
  console.log('✓ no emoji or pictographs in catalog values');
}

process.exit(failed ? 1 : 0);
