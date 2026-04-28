#!/usr/bin/env node
/**
 * migrate-elements.mjs
 *
 * Replaces inline HTML form/control elements with @tarodan/ui primitives:
 *   <input type="checkbox" ... />  → <Checkbox ... />
 *   <input type="radio" ... />     → <Radio ... />
 *   <input type="..." ... />       → <Input bare ... />
 *   <textarea ... />               → <Textarea bare ... />
 *   <select ...>..</select>        → <Select bare ...>..</Select>
 *   <button ...>..</button>        → <Button variant="secondary" ...>..</Button>
 *
 * Notes / caveats:
 *   - Only rewrites elements whose JSX spans a single line (tag + attrs on one line),
 *     or standard React multi-line attribute sets — we use a lenient regex that
 *     tolerates whitespace but requires the opening tag's attributes to be balanced
 *     at the same bracket depth.
 *   - Ensures the file imports the needed primitives from '@tarodan/ui' (dedupes).
 *   - Skips files inside packages/ui, packages/ui-native, codemods/, node_modules, dist/.
 *   - Skips <button> elements inside @tarodan/ui itself (the ones we allow).
 *   - <button> → <Button variant="secondary"> is a safe default; hot-path variants
 *     (primary action buttons) must be reviewed manually.
 *   - <select>'s children are preserved — we do NOT try to lift them into an `options`
 *     prop because many call sites use dynamic {map} children.
 *
 * Usage:
 *   node scripts/codemods/migrate-elements.mjs [--dry] [--path <glob>]... [--apps=web,admin]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const customPaths = [];
let apps = ['web', 'admin'];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--path') customPaths.push(args[i + 1]);
  else if (args[i].startsWith('--apps=')) apps = args[i].slice(7).split(',');
}

const SEARCH_ROOTS = customPaths.length
  ? customPaths.map((p) => path.resolve(repoRoot, p))
  : apps.map((a) => path.join(repoRoot, 'apps', a, 'src'));

const EXTS = new Set(['.tsx', '.jsx']);

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

/**
 * Finds balanced JSX opening tags of a given name.
 * Returns an array of { start, end, openTag, selfClosing, attrs } where
 *   start   = index of `<`
 *   end     = index **after** the matching `>` (exclusive)
 *   openTag = the whole `<name ...>` or `<name ... />` substring
 *   attrs   = everything between `<name` and the closing `>`/`/>`
 */
function findOpenTags(source, tagName) {
  const out = [];
  // Match tag start as a word boundary so we don't catch something like <inputfield
  const re = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
  let m;
  while ((m = re.exec(source)) !== null) {
    const start = m.index;
    // Walk forward, respecting {...} JSX expressions, "...", '...', `...`
    let i = m.index + tagName.length + 1;
    let braceDepth = 0;
    let inStr = 0; // 0 = not in string, otherwise charCode of current quote
    let prev = '';
    while (i < source.length) {
      const ch = source[i];
      if (inStr) {
        if (ch === String.fromCharCode(inStr) && prev !== '\\') inStr = 0;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch.charCodeAt(0);
      } else if (ch === '{') {
        braceDepth += 1;
      } else if (ch === '}') {
        braceDepth -= 1;
      } else if (braceDepth === 0 && ch === '>') {
        const selfClosing = source[i - 1] === '/';
        const end = i + 1;
        const attrs = source.slice(m.index + tagName.length + 1, selfClosing ? i - 1 : i);
        const openTag = source.slice(start, end);
        out.push({ start, end, openTag, selfClosing, attrs });
        break;
      }
      prev = ch;
      i += 1;
    }
  }
  return out;
}

function extractTypeAttr(attrs) {
  // type="checkbox" or type={'checkbox'} or type='checkbox'
  const m1 = /\btype\s*=\s*"([^"]+)"/.exec(attrs);
  if (m1) return m1[1];
  const m2 = /\btype\s*=\s*'([^']+)'/.exec(attrs);
  if (m2) return m2[1];
  const m3 = /\btype\s*=\s*\{\s*["']([^"']+)["']\s*\}/.exec(attrs);
  if (m3) return m3[1];
  return null;
}

function stripTypeAttr(attrs) {
  return attrs
    .replace(/\s*\btype\s*=\s*"[^"]+"/, '')
    .replace(/\s*\btype\s*=\s*'[^']+'/, '')
    .replace(/\s*\btype\s*=\s*\{[^}]+\}/, '');
}

function ensureImport(source, component) {
  // Already imported from @tarodan/ui?
  const uiImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]@tarodan\/ui['"];?/;
  const m = uiImportRe.exec(source);
  if (m) {
    const list = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (list.includes(component)) return source;
    const next = list.concat(component).sort().join(', ');
    return source.replace(uiImportRe, `import { ${next} } from '@tarodan/ui';`);
  }
  // Or already imported from local '@/components/ui'?
  const localImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui['"];?/;
  const m2 = localImportRe.exec(source);
  if (m2) {
    const list = m2[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (list.includes(component)) return source;
    const next = list.concat(component).sort().join(', ');
    return source.replace(localImportRe, `import { ${next} } from '@/components/ui';`);
  }
  // Insert a new import AFTER the last complete top-level import statement.
  // Handle multi-line imports: import { A, B,\n  C,\n} from '...';
  const imp = `import { ${component} } from '@tarodan/ui';\n`;
  // Find each import's starting index at line start; then walk to its terminating `;` at brace depth 0.
  const importRe = /^import\s/gm;
  let lastEnd = -1;
  let mm;
  while ((mm = importRe.exec(source)) !== null) {
    // Walk forward to find ';' outside of strings/braces; then include newline.
    let i = mm.index;
    let braceDepth = 0;
    let inStr = 0;
    let prev = '';
    while (i < source.length) {
      const ch = source[i];
      if (inStr) {
        if (ch === String.fromCharCode(inStr) && prev !== '\\') inStr = 0;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch.charCodeAt(0);
      } else if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth -= 1;
      else if (braceDepth === 0 && ch === ';') {
        // Skip following \n
        let j = i + 1;
        if (source[j] === '\n') j += 1;
        lastEnd = j;
        importRe.lastIndex = j;
        break;
      }
      prev = ch;
      i += 1;
    }
    if (lastEnd === -1) break;
  }
  if (lastEnd > 0) {
    return source.slice(0, lastEnd) + imp + source.slice(lastEnd);
  }
  return imp + source;
}

function rewriteFile(source, filePath) {
  let out = source;
  const componentsNeeded = new Set();

  // Process tags from end → start so offsets remain valid.
  const replacements = [];

  // <textarea>
  for (const t of findOpenTags(out, 'textarea')) {
    const attrs = t.attrs.trimStart();
    const replacement = t.selfClosing
      ? `<Textarea bare${attrs ? ' ' + attrs.trim() : ''} />`
      : `<Textarea bare${attrs ? ' ' + attrs.trim() : ''}>`;
    replacements.push({ start: t.start, end: t.end, text: replacement });
    componentsNeeded.add('Textarea');
  }

  // <select>
  for (const t of findOpenTags(out, 'select')) {
    const attrs = t.attrs.trimStart();
    const replacement = t.selfClosing
      ? `<Select bare${attrs ? ' ' + attrs.trim() : ''} />`
      : `<Select bare${attrs ? ' ' + attrs.trim() : ''}>`;
    replacements.push({ start: t.start, end: t.end, text: replacement });
    componentsNeeded.add('Select');
  }

  // <input> — dispatch on type
  for (const t of findOpenTags(out, 'input')) {
    const type = (extractTypeAttr(t.attrs) || '').toLowerCase();
    const cleanAttrs = stripTypeAttr(t.attrs).trim();
    if (type === 'checkbox') {
      const replacement = `<Checkbox${cleanAttrs ? ' ' + cleanAttrs : ''} />`;
      replacements.push({ start: t.start, end: t.end, text: replacement });
      componentsNeeded.add('Checkbox');
    } else if (type === 'radio') {
      const replacement = `<Radio${cleanAttrs ? ' ' + cleanAttrs : ''} />`;
      replacements.push({ start: t.start, end: t.end, text: replacement });
      componentsNeeded.add('Radio');
    } else {
      // Keep the original type= for Input so browser semantics stay correct.
      const replacement = `<Input bare${t.attrs ? ' ' + t.attrs.trim() : ''} />`;
      replacements.push({ start: t.start, end: t.end, text: replacement });
      componentsNeeded.add('Input');
    }
  }

  // <button>
  for (const t of findOpenTags(out, 'button')) {
    // If the button already has a className prefix from a migrated call (rare), skip.
    // Heuristic: leave <button> alone when it lives inside a Tooltip/Dropdown asChild slot
    // — we can't easily detect that statically; defer to manual review.
    const attrs = t.attrs.trimStart();
    // Add variant="secondary" (safe default) — do NOT override if user already passed one.
    const hasVariant = /\bvariant\s*=/.test(attrs);
    const openExtra = hasVariant ? '' : ' variant="secondary"';
    const replacement = t.selfClosing
      ? `<Button${openExtra}${attrs ? ' ' + attrs.trim() : ''} />`
      : `<Button${openExtra}${attrs ? ' ' + attrs.trim() : ''}>`;
    replacements.push({ start: t.start, end: t.end, text: replacement });
    componentsNeeded.add('Button');
  }

  if (replacements.length === 0) return { changed: false, next: source, count: 0 };

  // Replace openings end → start
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }

  // Now rewrite closing tags as well.
  out = out.replace(/<\/textarea>/g, '</Textarea>');
  out = out.replace(/<\/select>/g, '</Select>');
  out = out.replace(/<\/button>/g, '</Button>');
  // <input> has no closing tag.

  // Ensure 'use client' for files that will now import client-only components.
  if (
    !/^\s*['"]use client['"];?/m.test(out) &&
    (filePath.includes(path.sep + 'app' + path.sep) || filePath.includes('/app/')) &&
    /from ['"]@tarodan\/ui['"]/.test(out) === false
  ) {
    // Skip adding 'use client' — many admin pages already have it; others use Server Components.
    // Safer approach: do NOT automatically add — authors control this.
  }

  for (const comp of componentsNeeded) {
    out = ensureImport(out, comp);
  }

  return { changed: out !== source, next: out, count: replacements.length };
}

let totalFiles = 0;
let totalReplacements = 0;
const fileSummary = [];

for (const root of SEARCH_ROOTS) {
  const files = walk(root);
  for (const file of files) {
    // skip files inside packages/ui or packages/ui-native if accidentally included
    if (file.includes(`packages${path.sep}ui`)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const { changed, next, count } = rewriteFile(source, file);
    if (changed) {
      totalFiles += 1;
      totalReplacements += count;
      fileSummary.push({ file: path.relative(repoRoot, file), count });
      if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    }
  }
}

console.log(
  `${dryRun ? '[DRY RUN] Would update' : 'Updated'} ${totalFiles} file(s) with ${totalReplacements} replacement(s).`,
);
for (const { file, count } of fileSummary.slice(0, 40)) console.log(`  ${file}  (${count})`);
if (fileSummary.length > 40) console.log(`  ... and ${fileSummary.length - 40} more`);
