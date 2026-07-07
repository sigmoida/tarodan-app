#!/usr/bin/env node
/**
 * scenario-coverage.mjs — Test Konsolu senaryolarının (manifest) test kapsamını ölçer.
 *
 * Test kaynaklarında geçen senaryo-ID literal'lerini (AUTH-001, PAY-042 ...) tarar,
 * manifest ile çaprazlar ve domain bazında {covered / gap / missing} raporu üretir.
 *
 * Çıktı: docs/SCENARIO-COVERAGE.md
 * Çıkış kodu (CI gate):
 *   --strict                : gap-olmayan TÜM senaryolar kapsanmalı; eksikse exit 1
 *   --require=AUTH,REF,...   : yalnız bu domainler tam kapsanmalı; eksikse exit 1
 *   (varsayılan)            : yalnız rapor üretir, exit 0 (fan-out sürerken kullanışlı)
 *
 * Kullanım:
 *   node scripts/scenario-coverage.mjs
 *   node scripts/scenario-coverage.mjs --require=AUTH
 *   node scripts/scenario-coverage.mjs --strict
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'apps/api/test/scenarios/manifest.json');
const OUT = resolve(ROOT, 'docs/SCENARIO-COVERAGE.md');

const SCAN_DIRS = [
  'apps/api/test/e2e',
  'apps/web/e2e',
  'apps/mobile/app',
  'apps/mobile/src',
];
const SCAN_EXT = new Set(['.ts', '.tsx', '.mjs', '.yaml', '.yml']);
const ID_RE = /\b([A-Z]{2,4})-(\d{3})\b/g;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const requireArg = args.find((a) => a.startsWith('--require='));
const requiredPrefixes = requireArg ? requireArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : [];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (SCAN_EXT.has(extname(name))) acc.push(full);
  }
  return acc;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const validIds = new Set(manifest.scenarios.map((s) => s.id));

// ID -> Set<sourceFile> (yalnız AKTIF tag'ler; skip'ler kapsama sayılmaz)
const coveredBy = new Map();
const skippedOnly = new Set();
const SKIP_RE = /(\.skip\s*\(|scenarioSkip\s*\()/;
for (const dir of SCAN_DIRS) {
  for (const file of walk(resolve(ROOT, dir))) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = file.replace(ROOT + '/', '');
    for (const line of text.split('\n')) {
      const isSkip = SKIP_RE.test(line);
      for (const m of line.matchAll(ID_RE)) {
        const id = `${m[1]}-${m[2]}`;
        if (!validIds.has(id)) continue;
        if (isSkip) {
          skippedOnly.add(id);
        } else {
          if (!coveredBy.has(id)) coveredBy.set(id, new Set());
          coveredBy.get(id).add(rel);
        }
      }
    }
  }
}
// Aktif tag'i olan ID skip listesinden çıkar.
for (const id of coveredBy.keys()) skippedOnly.delete(id);

// Per-domain rollup
const domains = new Map(); // prefix -> { code, title, total, gap, covered, skipped, missingIds[], skippedIds[] }
for (const d of manifest.domains) {
  domains.set(d.prefix, {
    code: d.code,
    title: d.title,
    total: 0,
    gap: 0,
    covered: 0,
    skipped: 0,
    missingIds: [],
    skippedIds: [],
  });
}
for (const s of manifest.scenarios) {
  const d = domains.get(s.prefix);
  if (!d) continue;
  d.total += 1;
  if (s.gap) {
    d.gap += 1;
    continue;
  }
  if (coveredBy.has(s.id)) d.covered += 1;
  else if (skippedOnly.has(s.id)) {
    d.skipped += 1;
    d.skippedIds.push(s.id);
  } else d.missingIds.push(s.id);
}

let totTotal = 0,
  totGap = 0,
  totCovered = 0,
  totSkipped = 0,
  totMissing = 0;
const rows = [];
for (const [prefix, d] of domains) {
  const target = d.total - d.gap; // gap'ler hedef dışı
  const missing = target - d.covered - d.skipped;
  totTotal += d.total;
  totGap += d.gap;
  totCovered += d.covered;
  totSkipped += d.skipped;
  totMissing += missing;
  const pct = target === 0 ? 100 : Math.round((d.covered / target) * 100);
  const mark = missing === 0 ? '✅' : pct >= 50 ? '🟡' : '🔴';
  rows.push({
    prefix,
    code: d.code,
    title: d.title,
    total: d.total,
    gap: d.gap,
    target,
    covered: d.covered,
    skipped: d.skipped,
    missing,
    pct,
    mark,
    missingIds: d.missingIds,
    skippedIds: d.skippedIds,
  });
}
rows.sort((a, b) => a.code.localeCompare(b.code));

const targetAll = totTotal - totGap;
const pctAll = targetAll === 0 ? 100 : Math.round((totCovered / targetAll) * 100);

const md = [];
md.push('# Tarodan — Senaryo Kapsam Raporu\n');
md.push('> Otomatik üretildi: `node scripts/scenario-coverage.mjs`. Test kaynaklarındaki senaryo-ID');
md.push('> literal'.concat("'leri (ör. `AUTH-001`) manifest ile çaprazlanır. `gap` senaryolar hedef dışıdır (bkz. `docs/TEST-KNOWN-GAPS.md`).\n"));
md.push(`\n**Genel:** ${totCovered}/${targetAll} kapsandı (**%${pctAll}**) · ${totSkipped} skip (UI/ertelenmiş) · ${totGap} gap (hedef dışı) · ${totMissing} eksik · toplam ${totTotal} senaryo.\n`);
md.push('\n| | Domain | Toplam | Gap | Hedef | Kapsanan | Skip | Eksik | % |');
md.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  md.push(`| ${r.mark} | ${r.title} | ${r.total} | ${r.gap} | ${r.target} | ${r.covered} | ${r.skipped} | ${r.missing} | %${r.pct} |`);
}
md.push(`| | **TOPLAM** | **${totTotal}** | **${totGap}** | **${targetAll}** | **${totCovered}** | **${totSkipped}** | **${totMissing}** | **%${pctAll}** |`);

// Eksik senaryo kimlikleri (domain bazında, ilk 40)
md.push('\n## Eksik (kapsanmamış, gap-olmayan, skip-olmayan) senaryolar\n');
for (const r of rows) {
  if (r.missing === 0) continue;
  const shown = r.missingIds.slice(0, 40).join(', ');
  const more = r.missingIds.length > 40 ? ` … (+${r.missingIds.length - 40})` : '';
  md.push(`- **${r.prefix}** (${r.missing}): ${shown}${more}`);
}
const anySkipped = rows.some((r) => r.skipped > 0);
if (anySkipped) {
  md.push('\n## Skip (UI/parite/ertelenmiş — `scenario.skip`) senaryolar\n');
  for (const r of rows) {
    if (r.skipped === 0) continue;
    md.push(`- **${r.prefix}** (${r.skipped}): ${r.skippedIds.join(', ')}`);
  }
}
md.push('');
writeFileSync(OUT, md.join('\n'));
console.log(`[scenario-coverage] ${OUT.replace(ROOT + '/', '')} yazıldı — %${pctAll} (${totCovered}/${targetAll}), ${totMissing} eksik.`);

// Gate
let failed = false;
if (strict && totMissing > 0) {
  console.error(`[scenario-coverage] STRICT: ${totMissing} gap-olmayan senaryo kapsanmadı.`);
  failed = true;
}
for (const p of requiredPrefixes) {
  const r = rows.find((x) => x.prefix === p);
  if (!r) {
    console.error(`[scenario-coverage] --require=${p}: bilinmeyen domain.`);
    failed = true;
  } else if (r.missing > 0) {
    console.error(`[scenario-coverage] --require=${p}: ${r.missing} eksik (${r.missingIds.slice(0, 10).join(', ')}…).`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
