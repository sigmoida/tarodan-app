#!/usr/bin/env node
/**
 * migrate-link-buttons.mjs (web-only)
 *
 * Rewrites <Link href="…" className="btn-primary|btn-secondary|btn-danger …">
 * into <ButtonLink href="…" variant="…" …>, using the existing
 * apps/web/src/components/ui/ButtonLink.tsx wrapper (which is itself a
 * <Button asChild><Link/></Button>).
 *
 * Why: after the element migration, most button-styled Next.js Links were
 * left in place because we could not safely rewrite <Link> to <Button> in
 * one pass (the two accept different attribute sets). The result is that
 * .btn-primary / .btn-secondary / .btn-danger @apply helpers were still
 * carried on <Link> elements, re-stating the button default styling via
 * globals.css instead of going through the shared Button component.
 *
 * Transform rules:
 *   - Only literal className="…" with a btn-* token is matched.
 *   - className={…} expressions and template literals are skipped (they
 *     require case-by-case review).
 *   - btn-primary   → variant="primary" (default, so prop is dropped)
 *     btn-secondary → variant="secondary"
 *     btn-danger    → variant="danger"
 *   - Every Button default-restating token (px-4, py-2, rounded-lg,
 *     font-medium, transition-colors, inline-flex, items-center,
 *     justify-center) is dropped along with btn-*.
 *   - The tag name changes on both opening and matching closing tag.
 *   - An `import { ButtonLink } from '@/components/ui/ButtonLink'` is
 *     ensured at the top of each transformed file (unless already present).
 *
 * Usage:
 *   node scripts/codemods/migrate-link-buttons.mjs [--dry] [--path <dir>]...
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
  : [path.join(repoRoot, 'apps', 'web', 'src')];

const EXTS = new Set(['.tsx', '.jsx']);

const BTN_CLASS_TO_VARIANT = {
  'btn-primary': 'primary',
  'btn-secondary': 'secondary',
  'btn-danger': 'danger',
};

const BUTTON_REDUNDANT = new Set([
  'inline-flex',
  'items-center',
  'justify-center',
  'rounded-lg',
  'font-medium',
  'transition-colors',
  'disabled:pointer-events-none',
  'disabled:opacity-50',
  'disabled:cursor-not-allowed',
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-offset-2',
  'focus-visible:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-offset-2',
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
 * Find the matching closing </Link> for an opening <Link> whose body starts
 * at `bodyStart`. Tracks nested <Link> depth.
 */
function findMatchingClose(src, bodyStart) {
  let i = bodyStart;
  const n = src.length;
  let depth = 1;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) return -1;
    // Skip attribute-like contexts? We're between JSX elements so < always
    // starts a tag or </.
    if (src[lt + 1] === '/') {
      // closing tag </Link
      if (src.slice(lt + 2, lt + 6) === 'Link' && !/[A-Za-z0-9_]/.test(src[lt + 6] ?? '')) {
        depth -= 1;
        if (depth === 0) return lt;
      }
      i = lt + 1;
    } else if (src.slice(lt + 1, lt + 5) === 'Link' && !/[A-Za-z0-9_]/.test(src[lt + 5] ?? '')) {
      // Opening nested <Link — add depth unless self-closing
      const end = findOpeningTagEnd(src, lt + 5);
      if (end === -1) return -1;
      if (src[end - 1] !== '/') depth += 1;
      i = end + 1;
    } else {
      i = lt + 1;
    }
  }
  return -1;
}

function removeAttribute(attrs, attrRe) {
  const m = attrs.match(attrRe);
  if (!m) return attrs;
  const matchStart = m.index;
  let back = matchStart;
  while (back > 0 && /[ \t]/.test(attrs[back - 1])) back -= 1;
  const hasLeadingNewline = back > 0 && attrs[back - 1] === '\n';
  if (hasLeadingNewline) {
    return attrs.slice(0, back - 1) + attrs.slice(matchStart + m[0].length);
  }
  return attrs.slice(0, back) + attrs.slice(matchStart + m[0].length);
}

function transformOpeningAttrs(attrs) {
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

  if (keptTokens.length === 0) {
    next = removeAttribute(
      next,
      new RegExp(`className=(["'])${escapeRe(classValue)}\\1`),
    );
  } else {
    next = next.replace(
      new RegExp(`className=(["'])${escapeRe(classValue)}\\1`),
      `className=${q}${keptTokens.join(' ')}${q}`,
    );
  }

  if (intendedVariant !== 'primary') {
    next = ` variant="${intendedVariant}"` + next;
  }

  return next;
}

function ensureButtonLinkImport(src) {
  if (/from\s+['"]@\/components\/ui\/ButtonLink['"]/.test(src)) return src;
  if (/import\s*\{\s*ButtonLink\s*}\s*from\s*['"]@tarodan\/ui['"]/.test(src))
    return src;
  const existingImportsBlock = src.match(/import[\s\S]*?;/g)?.join('\n') ?? '';
  if (/\bButtonLink\b/.test(existingImportsBlock)) return src;

  const toInsert = `import { ButtonLink } from '@/components/ui/ButtonLink';\n`;

  // Honour `'use client'` / `'use server'` directives — they must stay on
  // the first lines, before any imports.
  const directivePrefix = src.match(
    /^(?:\uFEFF)?(?:\s*(?:'use (?:client|server|strict)'|"use (?:client|server|strict)")\s*;\s*\n)+/,
  );
  const startIdx = directivePrefix ? directivePrefix[0].length : 0;

  // Insert after the last import statement (if any) following the directive.
  const importRe = /(?:import[\s\S]*?;[ \t]*\n)+/y;
  importRe.lastIndex = startIdx;
  const m = importRe.exec(src);
  if (m && m.index === startIdx) {
    return src.slice(0, startIdx + m[0].length) + toInsert + src.slice(startIdx + m[0].length);
  }
  return src.slice(0, startIdx) + toInsert + src.slice(startIdx);
}

function processContent(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let transformed = 0;

  while (i < n) {
    const markerIdx = src.indexOf('<Link', i);
    if (markerIdx === -1) {
      out += src.slice(i);
      break;
    }
    const prefixEnd = markerIdx + '<Link'.length;
    const nextCh = src[prefixEnd];
    if (nextCh && /[A-Za-z0-9_]/.test(nextCh)) {
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
    const newAttrs = transformOpeningAttrs(attrs);

    if (newAttrs === null) {
      out += src.slice(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }

    // For self-closing Link there's no body/closing tag.
    if (isSelfClose) {
      out +=
        src.slice(i, markerIdx) + '<ButtonLink' + newAttrs + '/>';
      transformed += 1;
      i = tagEnd + 1;
      continue;
    }

    const bodyStart = tagEnd + 1;
    const closeLt = findMatchingClose(src, bodyStart);
    if (closeLt === -1) {
      // Safety: leave alone if we can't find the closing tag.
      out += src.slice(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }
    const closeEnd = src.indexOf('>', closeLt);
    if (closeEnd === -1) {
      out += src.slice(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }

    // Reassemble: <ButtonLink newAttrs> body </ButtonLink>
    const body = src.slice(bodyStart, closeLt);
    out +=
      src.slice(i, markerIdx) +
      '<ButtonLink' +
      newAttrs +
      '>' +
      body +
      '</ButtonLink>';
    transformed += 1;
    i = closeEnd + 1;
  }

  if (transformed > 0) {
    out = ensureButtonLinkImport(out);
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
console.log(`  <Link> → <ButtonLink> rewrites: ${totalTransformed}`);
for (const d of fileDiffs) {
  console.log(`  ${d.file}  (${d.transformed})`);
}
