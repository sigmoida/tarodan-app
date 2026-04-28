#!/usr/bin/env node
/**
 * migrate-colors.mjs
 *
 * Rewrites raw Tailwind color utility classes to semantic design-tokens:
 *   red      → danger
 *   green    → success
 *   blue     → info
 *   amber    → warning
 *   yellow   → warning
 *   orange   → primary
 *   emerald  → success
 *
 * Covered utility prefixes: bg, text, border, ring, from, to, via, outline,
 * decoration, divide, accent, caret, fill, stroke, shadow, placeholder.
 * Covered variants: hover:, focus:, focus-visible:, active:, disabled:, group-hover:,
 * group-focus:, peer-focus:, dark:, sm:/md:/lg:/xl:/2xl:, aria-*:, data-*:.
 *
 * Preserves any utility without a numeric suffix (e.g. bg-red → left alone — these
 * are rare and should be reviewed manually).
 *
 * Usage:
 *   node scripts/codemods/migrate-colors.mjs [--dry] [--path <glob>]...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const customPaths = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--path') customPaths.push(args[i + 1]);
}

const SEARCH_ROOTS = customPaths.length
  ? customPaths.map((p) => path.resolve(repoRoot, p))
  : [
      path.join(repoRoot, 'apps', 'web', 'src'),
      path.join(repoRoot, 'apps', 'admin', 'src'),
      path.join(repoRoot, 'packages', 'ui', 'src'),
      path.join(repoRoot, 'packages', 'ui-native', 'src'),
    ];

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

const COLOR_MAP = {
  red: 'danger',
  rose: 'danger',
  pink: 'danger',
  green: 'success',
  emerald: 'success',
  teal: 'success',
  lime: 'success',
  blue: 'info',
  sky: 'info',
  cyan: 'info',
  indigo: 'info',
  amber: 'warning',
  yellow: 'warning',
  orange: 'primary',
  purple: 'primary',
  violet: 'primary',
};

/**
 * Utility prefixes that accept a color + shade.
 * Keep this list tight: these are the prefixes we know exist in the preset token set.
 */
const PREFIXES = [
  'bg',
  'text',
  'border',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-x',
  'border-y',
  'ring',
  'ring-offset',
  'from',
  'to',
  'via',
  'outline',
  'decoration',
  'divide',
  'accent',
  'caret',
  'fill',
  'stroke',
  'shadow',
  'placeholder',
];

const prefixAlt = PREFIXES.map((p) => p.replace(/-/g, '\\-')).join('|');
const colorAlt = Object.keys(COLOR_MAP).join('|');
// (prefix)-(color)-(shade)  — shade must be 1–3 digits
// Allow an optional Tailwind variant prefix (hover:, focus:, md:, etc.) and opacity suffix (/50)
const pattern = new RegExp(`\\b((?:(?:[a-z0-9-]+):)*)(${prefixAlt})-(${colorAlt})-(\\d{2,3})(/\\d+)?\\b`, 'g');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

let filesChanged = 0;
let replacements = 0;
const fileDiffs = [];

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    let fileReplacements = 0;
    const next = original.replace(pattern, (_m, variants, prefix, color, shade, opacity) => {
      fileReplacements += 1;
      return `${variants}${prefix}-${COLOR_MAP[color]}-${shade}${opacity ?? ''}`;
    });
    if (fileReplacements > 0) {
      filesChanged += 1;
      replacements += fileReplacements;
      fileDiffs.push({ file: path.relative(repoRoot, file), count: fileReplacements });
      if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    }
  }
}

console.log(
  `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${filesChanged} file(s) with ${replacements} replacement(s).`,
);
for (const { file, count } of fileDiffs.slice(0, 50)) {
  console.log(`  ${file}  (${count})`);
}
if (fileDiffs.length > 50) {
  console.log(`  ... and ${fileDiffs.length - 50} more`);
}
