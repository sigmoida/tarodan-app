// Emits the canonical brand marks owned by @tarodan/brand into apps/web/public
// as real image files, so the web app can serve them through next/image
// (webp / responsive / lazy) instead of embedding a heavy base64 data URI.
// Also copies the manufacturer logos from the repo-root photos/logolar/ tree
// into public/photos/logolar/ — web pages and the mobile app reference them
// as /photos/logolar/... from the web host (the old path, populated by the
// seed's copyPhotosToPublic, never worked in Docker).
//
// The package / repo root is the single source of truth; these public files
// are generated build artifacts (gitignored). Runs automatically via web's
// predev / prebuild.
//
// Zero runtime deps: it reads the package's asset modules as text and pulls the
// data URI out, so there's no TS loader (tsx/ts-node) to install.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const brandDir = dirname(require.resolve('@tarodan/brand/package.json'));
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** [ asset module in @tarodan/brand, output file in public/ ] */
const ASSETS = [
  ['src/assets/tarodan-logo.ts', 'tarodan-logo.jpg'],
  ['src/assets/tarodan-logo-transparent.ts', 'tarodan-logo-transparent.png'],
];

function dataUriBytes(fileText, sourceRel) {
  const match = fileText.match(/data:[^;]+;base64,([A-Za-z0-9+/=]+)/);
  if (!match) throw new Error(`No base64 data URI found in ${sourceRel}`);
  return Buffer.from(match[1], 'base64');
}

mkdirSync(publicDir, { recursive: true });
for (const [sourceRel, outFile] of ASSETS) {
  const bytes = dataUriBytes(readFileSync(join(brandDir, sourceRel), 'utf8'), sourceRel);
  writeFileSync(join(publicDir, outFile), bytes);
  console.log(`@tarodan/brand → public/${outFile} (${Math.round(bytes.length / 1024)} KB)`);
}

// Üretici logoları: repo kökü photos/logolar/ → public/photos/logolar/
const logolarSrc = join(publicDir, '..', '..', '..', 'photos', 'logolar');
if (!existsSync(logolarSrc)) {
  throw new Error(`photos/logolar not found at ${logolarSrc} — manufacturer logos are required`);
}
const logolarDest = join(publicDir, 'photos', 'logolar');
mkdirSync(logolarDest, { recursive: true });
let logoCount = 0;
for (const file of readdirSync(logolarSrc)) {
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file)) continue;
  copyFileSync(join(logolarSrc, file), join(logolarDest, file));
  logoCount++;
}
console.log(`photos/logolar → public/photos/logolar (${logoCount} logos)`);
