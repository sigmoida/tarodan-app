#!/usr/bin/env node
/**
 * migrate-gray-to-semantic.mjs
 *
 * Rewrites gray-scale Tailwind classes to semantic token aliases.
 * Scope defaults to:
 *   - apps/web/src
 *   - apps/admin/src
 *   - packages/ui/src
 *
 * Usage:
 *   node scripts/codemods/migrate-gray-to-semantic.mjs [--dry] [--path <relative-path>]...
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
    ];

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

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

const replacements = [
  [/\bbg-gray-50\b/g, 'bg-surface'],
  [/\bbg-gray-100\b/g, 'bg-surface-alt'],
  [/\bbg-gray-200\b/g, 'bg-border-subtle'],
  [/\bbg-gray-300\b/g, 'bg-border-strong'],
  [/\bbg-gray-400\b/g, 'bg-subtle'],
  [/\bbg-gray-500\b/g, 'bg-muted'],
  [/\bbg-gray-600\b/g, 'bg-body'],
  [/\bbg-gray-700\b/g, 'bg-body'],
  [/\bbg-gray-800\b/g, 'bg-heading'],
  [/\bbg-gray-900\b/g, 'bg-heading'],

  [/\btext-gray-50\b/g, 'text-surface'],
  [/\btext-gray-100\b/g, 'text-surface-alt'],
  [/\btext-gray-200\b/g, 'text-border-subtle'],
  [/\btext-gray-300\b/g, 'text-border-strong'],
  [/\btext-gray-400\b/g, 'text-subtle'],
  [/\btext-gray-500\b/g, 'text-muted'],
  [/\btext-gray-600\b/g, 'text-muted'],
  [/\btext-gray-700\b/g, 'text-body'],
  [/\btext-gray-800\b/g, 'text-body'],
  [/\btext-gray-900\b/g, 'text-heading'],

  [/\bborder-gray-50\b/g, 'border-border-subtle'],
  [/\bborder-gray-100\b/g, 'border-border-subtle'],
  [/\bborder-gray-200\b/g, 'border-border'],
  [/\bborder-gray-300\b/g, 'border-border'],
  [/\bborder-gray-400\b/g, 'border-border-strong'],
  [/\bborder-gray-500\b/g, 'border-border-strong'],
  [/\bborder-gray-600\b/g, 'border-border-strong'],
  [/\bborder-gray-700\b/g, 'border-border-strong'],
  [/\bborder-gray-800\b/g, 'border-border-strong'],
  [/\bborder-gray-900\b/g, 'border-border-strong'],

  [/\bborder-(t|b|l|r|x|y)-gray-50\b/g, 'border-$1-border-subtle'],
  [/\bborder-(t|b|l|r|x|y)-gray-100\b/g, 'border-$1-border-subtle'],
  [/\bborder-(t|b|l|r|x|y)-gray-200\b/g, 'border-$1-border'],
  [/\bborder-(t|b|l|r|x|y)-gray-300\b/g, 'border-$1-border'],
  [/\bborder-(t|b|l|r|x|y)-gray-400\b/g, 'border-$1-border-strong'],
  [/\bborder-(t|b|l|r|x|y)-gray-500\b/g, 'border-$1-border-strong'],
  [/\bborder-(t|b|l|r|x|y)-gray-600\b/g, 'border-$1-border-strong'],
  [/\bborder-(t|b|l|r|x|y)-gray-700\b/g, 'border-$1-border-strong'],
  [/\bborder-(t|b|l|r|x|y)-gray-800\b/g, 'border-$1-border-strong'],
  [/\bborder-(t|b|l|r|x|y)-gray-900\b/g, 'border-$1-border-strong'],

  [/\bdivide-gray-50\b/g, 'divide-border-subtle'],
  [/\bdivide-gray-100\b/g, 'divide-border-subtle'],
  [/\bdivide-gray-200\b/g, 'divide-border'],
  [/\bdivide-gray-300\b/g, 'divide-border-strong'],

  [/\bplaceholder-gray-300\b/g, 'placeholder-border-strong'],
  [/\bplaceholder-gray-400\b/g, 'placeholder-subtle'],
  [/\bplaceholder-gray-500\b/g, 'placeholder-muted'],

  [/\bring-gray-200\b/g, 'ring-border-subtle'],
  [/\bring-gray-300\b/g, 'ring-border'],
  [/\bring-gray-400\b/g, 'ring-subtle'],
  [/\bfocus-visible:ring-gray-400\b/g, 'focus-visible:ring-subtle'],

  [/\bfrom-gray-50\b/g, 'from-surface'],
  [/\bfrom-gray-100\b/g, 'from-surface-alt'],
  [/\bfrom-gray-200\b/g, 'from-border-subtle'],
  [/\bfrom-gray-300\b/g, 'from-border-strong'],
  [/\bfrom-gray-400\b/g, 'from-subtle'],
  [/\bfrom-gray-800\b/g, 'from-body'],
  [/\bfrom-gray-900\b/g, 'from-heading'],
  [/\bto-gray-50\b/g, 'to-surface'],
  [/\bto-gray-100\b/g, 'to-surface-alt'],
  [/\bto-gray-200\b/g, 'to-border-subtle'],
  [/\bto-gray-300\b/g, 'to-border-strong'],
  [/\bto-gray-400\b/g, 'to-subtle'],
  [/\bto-gray-800\b/g, 'to-body'],
  [/\bto-gray-900\b/g, 'to-heading'],
  [/\bvia-gray-50\b/g, 'via-surface'],
  [/\bvia-gray-100\b/g, 'via-surface-alt'],
  [/\bvia-gray-200\b/g, 'via-border-subtle'],
  [/\bvia-gray-300\b/g, 'via-border-strong'],
  [/\bvia-gray-400\b/g, 'via-subtle'],
  [/\bvia-gray-800\b/g, 'via-body'],
  [/\bvia-gray-900\b/g, 'via-heading'],

  [/\bshadow-gray-100\b/g, 'shadow-border-subtle'],
  [/\bshadow-gray-200\b/g, 'shadow-border'],
  [/\bshadow-gray-300\b/g, 'shadow-border-strong'],
  [/\bshadow-gray-400\b/g, 'shadow-subtle'],
  [/\bshadow-gray-500\b/g, 'shadow-muted'],
  [/\bshadow-gray-800\b/g, 'shadow-body'],
  [/\bshadow-gray-900\b/g, 'shadow-heading'],
  [/\bshadow-gray-100\/(\d+)\b/g, 'shadow-border-subtle/$1'],
  [/\bshadow-gray-200\/(\d+)\b/g, 'shadow-border/$1'],
  [/\bshadow-gray-300\/(\d+)\b/g, 'shadow-border-strong/$1'],
  [/\bshadow-gray-400\/(\d+)\b/g, 'shadow-subtle/$1'],
  [/\bshadow-gray-500\/(\d+)\b/g, 'shadow-muted/$1'],
  [/\bshadow-gray-800\/(\d+)\b/g, 'shadow-body/$1'],
  [/\bshadow-gray-900\/(\d+)\b/g, 'shadow-heading/$1'],

  [/\bbg-white\b/g, 'bg-surface-elevated'],
  [/\bbg-white\/(\d+)\b/g, 'bg-surface-elevated/$1'],
  [/\bbg-black\b/g, 'bg-heading'],
  [/\bbg-black\/(\d+)\b/g, 'bg-heading/$1'],

  [/\btext-white\b/g, 'text-inverted'],
  [/\btext-white\/(\d+)\b/g, 'text-inverted/$1'],
  [/\btext-black\b/g, 'text-heading'],

  [/\bborder-white\b/g, 'border-surface-elevated'],
  [/\bborder-white\/(\d+)\b/g, 'border-surface-elevated/$1'],
  [/\bborder-black\b/g, 'border-heading'],

  [/\bfrom-white\b/g, 'from-surface-elevated'],
  [/\bfrom-white\/(\d+)\b/g, 'from-surface-elevated/$1'],
  [/\bfrom-black\b/g, 'from-heading'],
  [/\bto-white\b/g, 'to-surface-elevated'],
  [/\bto-white\/(\d+)\b/g, 'to-surface-elevated/$1'],
  [/\bto-black\b/g, 'to-heading'],
  [/\bvia-white\b/g, 'via-surface-elevated'],
  [/\bvia-white\/(\d+)\b/g, 'via-surface-elevated/$1'],
  [/\bvia-black\b/g, 'via-heading'],
];

let filesChanged = 0;
let totalReplacements = 0;
const changedFiles = [];

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    let next = original;
    let localCount = 0;

    for (const [pattern, replacement] of replacements) {
      const before = next;
      next = next.replace(pattern, replacement);
      if (before !== next) {
        const matches = before.match(pattern);
        localCount += matches ? matches.length : 0;
      }
    }

    if (next !== original) {
      filesChanged += 1;
      totalReplacements += localCount;
      changedFiles.push({ file: path.relative(repoRoot, file), count: localCount });
      if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    }
  }
}

console.log(
  `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${filesChanged} file(s) with ${totalReplacements} replacement(s).`,
);
for (const item of changedFiles.slice(0, 60)) {
  console.log(`  ${item.file} (${item.count})`);
}
if (changedFiles.length > 60) {
  console.log(`  ... and ${changedFiles.length - 60} more`);
}
