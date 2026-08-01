// Emits the canonical brand marks owned by @tarodan/brand into an app's public
// directory as real image files, so the app can serve them through next/image
// (webp / responsive / lazy) instead of embedding a heavy base64 data URI. The
// transparent mark alone is 462 KB — inlining it would land in the JS bundle.
//
// Repo-level on purpose: BOTH web and admin need the same marks at the same
// sizes. It used to live under apps/web/scripts and hardcode web's public dir,
// so admin had no way to serve the transparent mark and fell back to the opaque
// JPEG data URI on its coloured header.
//
// The @tarodan/brand package is the source of truth; these public files are
// generated build artifacts (gitignored). Manufacturer logos artık BUCKET'tan
// servis edilir ({env}/brands/… — bkz. seed-media.ts); repo kopyalama kaldırıldı. Invoked inline
// at the start of each app's `dev` and `build` scripts (not via pnpm pre/post
// hooks — those need `enable-pre-post-scripts`, which is off by default in pnpm
// 8, so the Docker prod build silently skipped them and shipped without logos).
//
// Zero runtime deps: it reads the package's asset modules as text and pulls the
// data URI out, so there's no TS loader (tsx/ts-node) to install.
//
// Usage: node scripts/sync-brand-assets.mjs <publicDir> [--manufacturer-logos]

import { createRequire } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Çözümleme ÇAĞIRAN uygulamadan yapılır, betiğin kendi konumundan değil:
// pnpm workspace paketleri yalnız onlara bağımlı olan paketin node_modules'ına
// bağlanıyor; depo kökünden `@tarodan/brand` görünmüyor.
const require = createRequire(join(process.cwd(), "package.json"));
const brandDir = dirname(require.resolve("@tarodan/brand/package.json"));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const [targetArg] = process.argv.slice(2);
if (!targetArg) {
  throw new Error(
    "Usage: node scripts/sync-brand-assets.mjs <publicDir>",
  );
}
const publicDir = resolve(process.cwd(), targetArg);

/** [ asset module in @tarodan/brand, output file in public/ ] */
const ASSETS = [
  ["src/assets/tarodan-logo.ts", "tarodan-logo.jpg"],
  ["src/assets/tarodan-logo-transparent.ts", "tarodan-logo-transparent.png"],
];

function dataUriBytes(fileText, sourceRel) {
  const match = fileText.match(/data:[^;]+;base64,([A-Za-z0-9+/=]+)/);
  if (!match) throw new Error(`No base64 data URI found in ${sourceRel}`);
  return Buffer.from(match[1], "base64");
}

mkdirSync(publicDir, { recursive: true });
for (const [sourceRel, outFile] of ASSETS) {
  const bytes = dataUriBytes(
    readFileSync(join(brandDir, sourceRel), "utf8"),
    sourceRel,
  );
  writeFileSync(join(publicDir, outFile), bytes);
  console.log(
    `@tarodan/brand → ${targetArg}/${outFile} (${Math.round(bytes.length / 1024)} KB)`,
  );
}
