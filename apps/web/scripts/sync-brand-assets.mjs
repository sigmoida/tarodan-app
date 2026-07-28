// Emits the canonical brand marks owned by @tarodan/brand into apps/web/public
// as real image files, so the web app can serve them through next/image
// (webp / responsive / lazy) instead of embedding a heavy base64 data URI.
//
// The package and repo-root photos/logolar directory are the sources of truth;
// these public files are generated build artifacts (gitignored). Invoked inline
// at the start of web's `dev` and `build` scripts (not via pnpm pre/post hooks — those need
// `enable-pre-post-scripts`, which is off by default in pnpm 8, so the Docker
// prod build silently skipped them and shipped without the logos).
//
// Zero runtime deps: it reads the package's asset modules as text and pulls the
// data URI out, so there's no TS loader (tsx/ts-node) to install.

import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const brandDir = dirname(require.resolve("@tarodan/brand/package.json"));
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

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
    `@tarodan/brand → public/${outFile} (${Math.round(bytes.length / 1024)} KB)`,
  );
}

const manufacturerLogoSource = join(
  publicDir,
  "..",
  "..",
  "..",
  "photos",
  "logolar",
);
if (!existsSync(manufacturerLogoSource)) {
  throw new Error(
    `Manufacturer logo source is missing: ${manufacturerLogoSource}`,
  );
}

const manufacturerLogoOutput = join(publicDir, "photos", "logolar");
mkdirSync(manufacturerLogoOutput, { recursive: true });

let manufacturerLogoCount = 0;
for (const file of readdirSync(manufacturerLogoSource)) {
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file)) continue;
  copyFileSync(
    join(manufacturerLogoSource, file),
    join(manufacturerLogoOutput, file),
  );
  manufacturerLogoCount += 1;
}
console.log(
  `photos/logolar → public/photos/logolar (${manufacturerLogoCount} logos)`,
);
