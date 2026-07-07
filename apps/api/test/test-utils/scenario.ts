/**
 * Senaryo etiketleme — Test Konsolu (2293) ile e2e testleri arasında izlenebilirlik.
 *
 * `scenario('AUTH-001', async () => { ... })` çağrısı manifest'ten başlığı ve önceliği
 * (pri) okuyup testi `AUTH-001 [P0] <başlık>` adıyla kaydeder. Böylece:
 *   - test adı manifest ile her zaman senkron (yazım hatası → manifest'te yoksa fırlatır),
 *   - P0-smoke filtrelemesi mümkün: `jest -t "\[P0\]"`,
 *   - `scripts/scenario-coverage.mjs` ID literal'lerini tarayıp kapsamı ölçer.
 *
 * Gap (henüz uygulanmamış/buglı) senaryolar otomatik `it.skip` olur ve
 * docs/TEST-KNOWN-GAPS.md'de listelidir.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

interface ManifestScenario {
  id: string;
  prefix: string;
  title: string;
  tur: string;
  pri: 'P0' | 'P1' | 'P2';
  steps: string;
  exp: string;
  gap: boolean;
  gapRefs: string[];
}

interface Manifest {
  meta: { total: number; gapCount: number };
  scenarios: ManifestScenario[];
}

const MANIFEST: Manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'scenarios', 'manifest.json'), 'utf8'),
);
const BY_ID = new Map<string, ManifestScenario>(MANIFEST.scenarios.map((s) => [s.id, s]));

function nameFor(m: ManifestScenario): string {
  return `${m.id} [${m.pri}] ${m.title}`;
}

export function getScenario(id: string): ManifestScenario {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Bilinmeyen senaryo ID: ${id} (manifest'te yok).`);
  return m;
}

type TestFn = (...args: any[]) => unknown;

interface ScenarioApi {
  /** Bir senaryoyu test olarak kaydet. Gap senaryolar otomatik skip edilir. */
  (id: string, fn: TestFn, timeoutMs?: number): void;
  /** Henüz uygulanamayan bir senaryoyu açıkça skip et (gerekçeyle). */
  skip(id: string, reason: string): void;
  /** Sadece bu senaryoyu koş (debug). Commit edilmemeli. */
  only(id: string, fn: TestFn, timeoutMs?: number): void;
}

function scenarioImpl(id: string, fn: TestFn, timeoutMs?: number): void {
  const m = getScenario(id);
  const name = nameFor(m);
  if (m.gap) {
    it.skip(`${name} — SKIP(gap: ${m.gapRefs.join('; ') || 'bilinen eksik'})`, fn as any, timeoutMs);
    return;
  }
  it(name, fn as any, timeoutMs);
}

export function scenarioSkip(id: string, reason: string): void {
  const m = BY_ID.get(id);
  const name = m ? nameFor(m) : `${id} [?]`;
  it.skip(`${name} — SKIP(${reason})`, () => {});
}

function scenarioOnly(id: string, fn: TestFn, timeoutMs?: number): void {
  const m = getScenario(id);
  // eslint-disable-next-line jest/no-focused-tests
  it.only(nameFor(m), fn as any, timeoutMs);
}

export const scenario: ScenarioApi = Object.assign(scenarioImpl, {
  skip: scenarioSkip,
  only: scenarioOnly,
});
