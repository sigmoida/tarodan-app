#!/usr/bin/env node
/**
 * cleanup-redundant-classnames.mjs
 *
 * Strips Tailwind utility classes from className="..." attributes when those
 * classes merely re-state the defaults already baked into @tarodan/ui form
 * primitives (Input, Textarea, Select).
 *
 * Why: After `migrate-elements.mjs` replaced raw <input>/<select>/<textarea>
 * with <Input bare>/<Select bare>/<Textarea bare>, the inline classNames were
 * preserved verbatim — but they duplicate the component's own default styles.
 * Example:
 *   Before: <Input bare className="w-full px-3 py-2 border border-gray-300
 *                                  rounded-lg focus:outline-none focus:ring-2
 *                                  focus:ring-primary-500" />
 *   After:  <Input bare />
 *
 * Behavior:
 *   - Detects className strings containing an "anchor" token that indicates a
 *     form-input default restatement (e.g. `border-gray-300` + `rounded-lg`).
 *   - Removes every REDUNDANT_TOKEN from such strings; keeps anything else.
 *   - When the resulting className is empty, removes the entire
 *     className="..." attribute (and any stray whitespace / trailing comma).
 *   - When the attribute is removed AND the element is a form primitive with
 *     a leading `bare` prop, it also removes `bare` (since <Input bare /> with
 *     nothing else is equivalent to <Input />).
 *
 * Safe-by-default:
 *   - Only touches className="..." or className='...' string literals.
 *   - Ignores className={...} expressions (variables, cn() calls, etc.).
 *   - Requires an ANCHOR token match so we never scrub unrelated classNames.
 *
 * Usage:
 *   node scripts/codemods/cleanup-redundant-classnames.mjs [--dry] [--path <dir>]...
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
    ];

const EXTS = new Set(['.tsx', '.jsx']);

/**
 * Tokens that are part of Input / Textarea / Select default className.
 * When found together with an ANCHOR, these can be safely dropped.
 */
const REDUNDANT_TOKENS = new Set([
  // Layout / sizing defaults
  'flex',
  'w-full',
  'rounded-lg',
  'border',
  'bg-white',
  'transition-colors',
  // size=md defaults
  'h-10',
  'text-sm',
  'px-3',
  'py-2',
  // size=sm defaults
  'h-8',
  'px-2.5',
  'py-1.5',
  // Focus defaults
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-offset-1',
  'focus:ring-primary-200',
  'focus:ring-primary-500', // close enough to default; common mistake
  'focus:border-primary-500',
  'focus:border-transparent', // benign override, drop
  // Border & placeholder defaults
  'border-gray-300',
  'placeholder:text-gray-400',
  // Admin-specific CSS helpers that merely re-apply <Input> / <Select> defaults
  // via @apply inside globals.css. Safe to drop on @tarodan/ui primitives.
  'admin-input',
  'input-dark',
]);

/**
 * If the className doesn't contain at least one of these tokens, leave it
 * entirely alone. This prevents accidental scrubbing on unrelated elements.
 * Anchor tokens are themselves redundant when applied to form primitives
 * (Input / Textarea / Select), so their presence is a strong signal that
 * the className is restating defaults.
 */
const ANCHOR_TOKENS = new Set([
  'border-gray-300',
  'focus:ring-primary-200',
  'focus:ring-primary-500',
  'admin-input',
  'input-dark',
]);

function cleanClassName(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (!tokens.some((t) => ANCHOR_TOKENS.has(t))) return null;
  const kept = tokens.filter((t) => !REDUNDANT_TOKENS.has(t));
  // Nothing to drop — leave alone so we don't rewrite the attribute for no reason
  if (kept.length === tokens.length) return null;
  return kept.join(' ');
}

const REMOVE_SENTINEL = '__TARO_REMOVE_CLASSNAME__';

function processContent(src) {
  let changed = 0;
  let classNamesStripped = 0;
  let classNamesRemoved = 0;

  // Replace className="..." and className='...' string literals only.
  // Skip className={...} to avoid touching expressions.
  const out1 = src.replace(/className=(["'])([^"'\n]+)\1/g, (full, q, val) => {
    const cleaned = cleanClassName(val);
    if (cleaned === null) return full;
    changed += 1;
    if (cleaned.length === 0) {
      classNamesRemoved += 1;
      return REMOVE_SENTINEL;
    }
    classNamesStripped += 1;
    return `className=${q}${cleaned}${q}`;
  });

  // Remove sentinel. Also swallow one leading whitespace (or newline+indent)
  // so we don't leave dangling whitespace. If sentinel was on its own line
  // (pretty-printed JSX), remove that whole line.
  let out2 = out1.replace(
    new RegExp(`[ \\t]*${REMOVE_SENTINEL}\\s*\\n`, 'g'),
    '',
  );
  out2 = out2.replace(new RegExp(`\\s*${REMOVE_SENTINEL}`, 'g'), '');

  // Best-effort `bare` cleanup: remove standalone `bare` prop on Input /
  // Textarea / Select openings that have no label=/error=/helperText= props.
  // This is a cosmetic cleanup; the component behaves identically without it
  // when there are no wrapper-triggering props.
  let bareRemoved = 0;
  out2 = out2.replace(
    /<(Input|Textarea|Select)\b([^>]*?)>/gs,
    (full, tag, attrs) => {
      if (!/\sbare(\s|\/>|>|$)/.test(attrs)) return full;
      if (/\blabel=/.test(attrs) || /\berror=/.test(attrs) || /\bhelperText=/.test(attrs)) {
        return full;
      }
      const nextAttrs = attrs.replace(/\s+bare(?=\s|\/>|>|$)/, '');
      if (nextAttrs === attrs) return full;
      bareRemoved += 1;
      return `<${tag}${nextAttrs}>`;
    },
  );

  return {
    next: out2,
    changed,
    classNamesStripped,
    classNamesRemoved,
    bareRemoved,
  };
}

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
      if (
        e.name === 'node_modules' ||
        e.name === 'dist' ||
        e.name === '.next' ||
        e.name === '.turbo'
      )
        continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

let filesChanged = 0;
let totalStripped = 0;
let totalRemoved = 0;
let totalBareRemoved = 0;
const fileDiffs = [];

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const result = processContent(original);
    if (result.next !== original) {
      filesChanged += 1;
      totalStripped += result.classNamesStripped;
      totalRemoved += result.classNamesRemoved;
      totalBareRemoved += result.bareRemoved;
      fileDiffs.push({
        file: path.relative(repoRoot, file),
        stripped: result.classNamesStripped,
        removed: result.classNamesRemoved,
        bareRemoved: result.bareRemoved,
      });
      if (!dryRun) fs.writeFileSync(file, result.next, 'utf8');
    }
  }
}

console.log(
  `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${filesChanged} file(s):`,
);
console.log(`  classNames stripped (partial clean): ${totalStripped}`);
console.log(`  classNames removed  (fully empty):   ${totalRemoved}`);
console.log(`  bare props removed:                  ${totalBareRemoved}`);
for (const d of fileDiffs.slice(0, 50)) {
  console.log(
    `  ${d.file}  (stripped=${d.stripped} removed=${d.removed} bare=${d.bareRemoved})`,
  );
}
if (fileDiffs.length > 50) {
  console.log(`  ... and ${fileDiffs.length - 50} more`);
}
