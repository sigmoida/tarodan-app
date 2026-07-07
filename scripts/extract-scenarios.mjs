#!/usr/bin/env node
/**
 * extract-scenarios.mjs — Test Konsolu (Tarodan-Test-Konsolu.html) → makine-okur manifest.
 *
 * `window.__DATA__` içindeki 2293 senaryoyu `apps/api/test/scenarios/manifest.json` dosyasına
 * yazar ve `findings` bulgularından "gap" (henüz uygulanmamış/buglı) senaryoları işaretleyip
 * `docs/TEST-KNOWN-GAPS.md` notunu üretir.
 *
 * Bağımsız (sıfır bağımlılık). Kullanım:
 *   node scripts/extract-scenarios.mjs [path/to/Tarodan-Test-Konsolu.html]
 *
 * Çıktılar:
 *   apps/api/test/scenarios/manifest.json   — { meta, domains, scenarios[] }
 *   docs/TEST-KNOWN-GAPS.md                 — bulgu tablosu + gap senaryo kimlikleri
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = process.argv[2] || resolve(ROOT, 'Tarodan-Test-Konsolu.html');
const MANIFEST = resolve(ROOT, 'apps/api/test/scenarios/manifest.json');
const GAPS_MD = resolve(ROOT, 'docs/TEST-KNOWN-GAPS.md');

function clean(t) {
  if (!t) return '';
  return t
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "RAT-110, RAT-111" / "ADM-011/012" / "JRN-030/031/032" → ["RAT-110", ...] */
function parseRefs(ref) {
  const ids = new Set();
  if (!ref) return ids;
  for (const m of ref.matchAll(/([A-Z]{2,4})-(\d{2,3}(?:\/\d{2,3})*)/g)) {
    const prefix = m[1];
    for (const n of m[2].split('/')) ids.add(`${prefix}-${String(parseInt(n, 10)).padStart(3, '0')}`);
  }
  return ids;
}

function loadData(html) {
  const i = html.indexOf('window.__DATA__=');
  if (i < 0) throw new Error('window.__DATA__ bulunamadı');
  const start = html.indexOf('{', i);
  const end = html.indexOf('</script>', i);
  return JSON.parse(html.slice(start, end).trim().replace(/;$/, ''));
}

const data = loadData(readFileSync(HTML, 'utf8'));
const scenarios = data.scenarios || [];
const findings = data.findings || [];
const domains = data.domains || [];

const validIds = new Set(scenarios.map((s) => s.id));
const gapReason = new Map(); // id -> finding[]
for (const f of findings) {
  for (const rid of parseRefs(f.ref || '')) {
    if (!validIds.has(rid)) continue;
    if (!gapReason.has(rid)) gapReason.set(rid, []);
    gapReason.get(rid).push(f);
  }
}
const gapIds = new Set(gapReason.keys());

const manifest = scenarios.map((s) => ({
  id: s.id,
  code: s.code,
  prefix: s.prefix,
  domTitle: s.domTitle,
  title: s.title,
  tur: s.tur,
  pri: s.pri,
  steps: clean(s.steps),
  exp: clean(s.exp),
  gap: gapIds.has(s.id),
  gapRefs: gapIds.has(s.id) ? [...new Set(gapReason.get(s.id).map((f) => f.ref || ''))].sort() : [],
}));

const out = {
  meta: {
    total: manifest.length,
    source: 'Tarodan-Test-Konsolu.html (window.__DATA__)',
    generated: data.meta?.generated ?? null,
    gapCount: gapIds.size,
    byPri: data.meta?.byPri ?? null,
  },
  domains: domains.map((d) => ({ code: d.code, prefix: d.prefix, title: d.title, count: d.count })),
  scenarios: manifest,
};

mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');

// --- docs/TEST-KNOWN-GAPS.md ---
const sevOrder = { Yüksek: 0, Orta: 1, Düşük: 2, Bilgi: 3, Yapısal: 4 };
const byDom = new Map();
for (const f of findings) {
  if (!byDom.has(f.domain)) byDom.set(f.domain, []);
  byDom.get(f.domain).push(f);
}
const md = [];
md.push('# Tarodan — Bilinen Eksikler / Açıklar (Test Edilmeyen Senaryolar)\n');
md.push(
  '> Bu senaryolar, hedeflenen davranışı **henüz uygulanmamış ya da buglı** olan özellikleri tarif eder. ' +
    'Kullanıcı kararıyla bunlar için **otomatik test yazılmadı**; manifest\'te `gap:true` olarak işaretliler ve ' +
    '`scenario-coverage` kapsam hedefinin **dışında** tutulur. Kaynak: `Tarodan-Test-Konsolu.html` → `findings`.\n',
);
md.push(`\n**Özet:** ${findings.length} bulgu · ${gapIds.size} senaryo gap olarak işaretli.\n`);
for (const [dom, fs] of byDom) {
  fs.sort((x, y) => (sevOrder[x.sev] ?? 9) - (sevOrder[y.sev] ?? 9));
  md.push(`\n## ${dom}\n`);
  md.push('| Önem | Senaryo ref | Açıklama | Kanıt |');
  md.push('|---|---|---|---|');
  for (const f of fs) {
    const ref = f.ref || '—';
    md.push(`| ${f.sev || ''} | ${ref} | ${clean(f.text).replace(/\|/g, '\\|')} | ${clean(f.evidence).replace(/\|/g, '\\|')} |`);
  }
}
md.push('\n---\n');
md.push('## Gap olarak işaretli senaryo kimlikleri\n');
for (const rid of [...gapIds].sort()) {
  const sc = scenarios.find((s) => s.id === rid);
  const refs = [...new Set(gapReason.get(rid).map((f) => f.ref || ''))].sort().join('; ');
  md.push(`- **${rid}** — ${sc.title}  _(bulgu: ${refs})_`);
}
md.push('');
writeFileSync(GAPS_MD, md.join('\n'));

console.log(`[extract-scenarios] manifest.json: ${manifest.length} senaryo, ${gapIds.size} gap`);
console.log(`[extract-scenarios] docs/TEST-KNOWN-GAPS.md yazıldı`);
