#!/usr/bin/env node
/**
 * cleanup-button-variants.mjs
 *
 * Rewrites `<Button className="btn-primary|btn-secondary|btn-danger ...">`
 * usages to the proper @tarodan/ui Button variant prop, and strips other
 * Button default-restating classes (px-4, py-2, rounded-lg, font-medium,
 * transition-colors, disabled:opacity-50, etc.).
 *
 * History: the earlier element migration codemod replaced raw <button> with
 * <Button variant="secondary"> (a "least-surprise" default). The original
 * intent of the designer lived on in the `btn-*` @apply helper class, which
 * visually overrides the variant via tailwind-merge. Result: brittle,
 * mismatched pairs like <Button variant="secondary" className="btn-primary">
 * that render as primary but read as secondary.
 *
 * Transform rules (per <Button …> opening tag):
 *   - Find any btn-primary / btn-secondary / btn-danger token in className.
 *   - Strip that token and all known Button-default tokens from className.
 *   - Infer the intended variant from the stripped btn-* token:
 *       btn-primary   → variant="primary"   (default, so prop is dropped)
 *       btn-secondary → variant="secondary"
 *       btn-danger    → variant="danger"
 *   - If <Button> already has a variant= prop, rewrite it to match the
 *     intended variant (or drop it when intended is primary).
 *   - Collapse/drop the className attribute when the resulting string is
 *     empty or only whitespace.
 *
 * Safe-by-default:
 *   - Only touches <Button …> opening tags with className="..." string
 *     literals — skips className={…} expressions.
 *   - A manual parser tracks {…}, "…", '…' boundaries so `onClick={() => {…}}`
 *     and other JSX expressions are handled correctly.
 *   - Preserves original indentation of subsequent attribute lines.
 *
 * Usage:
 *   node scripts/codemods/cleanup-button-variants.mjs [--dry] [--path <dir>]...
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

const BTN_CLASS_TO_VARIANT = {
  'btn-primary': 'primary',
  'btn-secondary': 'secondary',
  'btn-danger': 'danger',
};

/**
 * Tokens the Button component already applies through its cva variants /
 * defaults. Safe to drop when present alongside a btn-* anchor (or even on
 * their own — but we only touch classNames that contain a btn-* anchor so
 * we never scrub anything unrelated).
 */
const BUTTON_REDUNDANT = new Set([
  // cva base classes
  'inline-flex',
  'items-center',
  'justify-center',
  'rounded-lg',
  'font-medium',
  'transition-colors',
  // disabled defaults
  'disabled:pointer-events-none',
  'disabled:opacity-50',
  'disabled:cursor-not-allowed',
  // focus defaults
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-offset-2',
  'focus-visible:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-offset-2',
  // size=md defaults (h-10 px-4 text-sm)
  'h-10',
  'px-4',
  'text-sm',
  'py-2',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOpeningTagEnd(src, startIdx) {
  let i = startIdx;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) i += 1;
        i += 1;
      }
      i += 1;
    } else if (c === '{') {
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
    } else if (c === '>') {
      return i;
    } else {
      i += 1;
    }
  }
  return -1;
}

/**
 * Remove an attribute from an attrs string. If the attribute occupies its
 * own line (preceding newline + indent), eat that whole line including the
 * leading newline. Otherwise only eat horizontal whitespace before it, so
 * we don't merge this line with the previous one.
 */
function removeAttribute(attrs, attrRe) {
  const m = attrs.match(attrRe);
  if (!m) return attrs;

  const matchStart = m.index;
  // Walk backwards to find either the start-of-string or a non-whitespace.
  let back = matchStart;
  while (back > 0 && /[ \t]/.test(attrs[back - 1])) back -= 1;
  const hasLeadingNewline = back > 0 && attrs[back - 1] === '\n';

  if (hasLeadingNewline) {
    // Eat newline + spaces before the attribute.
    return attrs.slice(0, back - 1) + attrs.slice(matchStart + m[0].length);
  }
  // Same-line attribute: eat horizontal whitespace before it, keep earlier
  // attributes intact.
  return attrs.slice(0, back) + attrs.slice(matchStart + m[0].length);
}

function transformButtonTag(attrs) {
  const classNameMatch = attrs.match(/className=(["'])([^"']+)\1/);
  if (!classNameMatch) return null;

  const classValue = classNameMatch[2];
  const tokens = classValue.split(/\s+/).filter(Boolean);
  const btnToken = tokens.find((t) => BTN_CLASS_TO_VARIANT[t]);
  if (!btnToken) return null;

  const intendedVariant = BTN_CLASS_TO_VARIANT[btnToken];
  const keptTokens = tokens.filter(
    (t) => !(t in BTN_CLASS_TO_VARIANT) && !BUTTON_REDUNDANT.has(t),
  );

  let next = attrs;
  const q = classNameMatch[1];

  // 1) Rewrite or remove className.
  if (keptTokens.length === 0) {
    next = removeAttribute(
      next,
      new RegExp(`className=(["'])${escapeRe(classValue)}\\1`),
    );
  } else {
    const newClass = keptTokens.join(' ');
    next = next.replace(
      new RegExp(`className=(["'])${escapeRe(classValue)}\\1`),
      `className=${q}${newClass}${q}`,
    );
  }

  // 2) Reconcile variant= prop with intended variant.
  const variantRe = /variant=(["'])([^"']+)\1/;
  const variantMatch = next.match(variantRe);
  if (variantMatch) {
    const currentVariant = variantMatch[2];
    if (intendedVariant === 'primary') {
      // primary is cva default — drop the prop.
      next = removeAttribute(next, variantRe);
    } else if (currentVariant !== intendedVariant) {
      next = next.replace(
        variantRe,
        `variant=${variantMatch[1]}${intendedVariant}${variantMatch[1]}`,
      );
    }
    // else: current variant already matches intent, nothing to do.
  } else if (intendedVariant !== 'primary') {
    // Add variant as the first attribute so it reads naturally.
    next = ` variant="${intendedVariant}"` + next;
  }

  return next;
}

function processContent(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let transformed = 0;

  while (i < n) {
    const markerIdx = src.indexOf('<Button', i);
    if (markerIdx === -1) {
      out += src.slice(i);
      break;
    }
    const prefixEnd = markerIdx + '<Button'.length;
    const nextCh = src[prefixEnd];
    if (nextCh && /[A-Za-z0-9_]/.test(nextCh)) {
      // Matched <ButtonLink or similar — skip.
      out += src.slice(i, prefixEnd);
      i = prefixEnd;
      continue;
    }

    const tagEnd = findOpeningTagEnd(src, prefixEnd);
    if (tagEnd === -1) {
      out += src.slice(i);
      break;
    }

    const isSelfClose = src[tagEnd - 1] === '/';
    const attrs = src.slice(prefixEnd, isSelfClose ? tagEnd - 1 : tagEnd);
    const newAttrs = transformButtonTag(attrs);

    if (newAttrs === null) {
      out += src.slice(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }

    transformed += 1;
    out +=
      src.slice(i, markerIdx) +
      '<Button' +
      newAttrs +
      (isSelfClose ? '/>' : '>');
    i = tagEnd + 1;
  }

  return { next: out, transformed };
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
let totalTransformed = 0;
const fileDiffs = [];

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const result = processContent(original);
    if (result.next !== original) {
      filesChanged += 1;
      totalTransformed += result.transformed;
      fileDiffs.push({
        file: path.relative(repoRoot, file),
        transformed: result.transformed,
      });
      if (!dryRun) fs.writeFileSync(file, result.next, 'utf8');
    }
  }
}

console.log(
  `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${filesChanged} file(s):`,
);
console.log(`  <Button> btn-* rewrites: ${totalTransformed}`);
for (const d of fileDiffs.slice(0, 60)) {
  console.log(`  ${d.file}  (${d.transformed})`);
}
if (fileDiffs.length > 60) {
  console.log(`  ... and ${fileDiffs.length - 60} more`);
}
