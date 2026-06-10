/**
 * run-each.mjs — Her journey'i 0'DAN izole koşar.
 *
 * Neden: 136 journey'i tek koşuda paylaşılan DB'de koşunca (a) rezervasyon/kayıt
 * birikiyor (shared-state), (b) nest-watch API'si uzun koşuda restart ediyor.
 * Bu runner: STABİL API (build + node dist/main, watch yok) + WEB'i bir kez başlatır,
 * her journey'den ÖNCE /dev/reset-state ile DB'yi seed-temiz haline döndürür, sonra
 * o tek journey'i koşar. Biri patlasa diğerini etkilemez. Çıktı: e2e-results.md
 *
 * Kullanım:  node apps/web/e2e/run-each.mjs            (hepsi)
 *            node apps/web/e2e/run-each.mjs j050 j051  (sadece bunlar)
 */
import { execSync, spawn } from 'node:child_process';
import { readdirSync, writeFileSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');            // apps/web
const ROOT = path.resolve(WEB_DIR, '../..');              // repo root
const API_DIR = path.join(ROOT, 'apps/api');
const JOURNEY_DIR = path.join(WEB_DIR, 'e2e/journeys');
const TEST_DB = 'postgresql://postgres:postgres@localhost:5432/tarodan_test?schema=public';
const API_URL = 'http://localhost:3001/api/health';
const WEB_URL = 'http://localhost:3000';

const API_ENV = {
  ...process.env,
  NODE_ENV: 'test', PORT: '3001', DATABASE_URL: TEST_DB, TEST_DATABASE_URL: TEST_DB, PAYMENT_BYPASS: 'true',
  SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '',
  SENDGRID_API_KEY: '', MAIL_FROM: 'no-reply@tarodan.test',
  // Bash/shell prod env'i sızdırdığı için (RDS DATABASE_URL gibi) SURAT'ı da stub'a ZORLA →
  // orders/buy ön-kargo 503 (SURAT_TECHNICAL) olmasın.
  SURAT_SOAP_MODE: 'stub', SURAT_STUB_THROW: '', SURAT_STUB_RESPONSE: 'Tamam', SURAT_CARGO_ENABLED: 'true',
  // PayTR callback imzası: payment journey'leri PAYTR_KEY='test-key'/SALT='test-salt' (hardcoded) +
  // .env.test de aynı. API'yi BU değerlere zorla (Bash leak'e karşı) → imza uyuşur → callback kabul.
  PAYTR_MERCHANT_KEY: 'test-key', PAYTR_MERCHANT_SALT: 'test-salt', PAYTR_MERCHANT_ID: 'test-merchant',
};
const SETUP_ENV = { ...API_ENV, SEED_SKIP_IMAGES: '1' };
console.log(`[runner] process.env.DATABASE_URL=${(process.env.DATABASE_URL||'').replace(/:[^:@/]+@/,':***@').slice(-50)}`);
console.log(`[runner] API_ENV.DATABASE_URL=${(API_ENV.DATABASE_URL||'').replace(/:[^:@/]+@/,':***@').slice(-50)}`);

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const psql = (sql) =>
  sh(`docker exec tarodan-postgres psql -U postgres -d tarodan_test -c "${sql.replace(/"/g, '\\"')}"`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, label, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok || r.status === 200) { console.log(`✓ ${label} hazır`); return; } } catch {}
    await sleep(2000);
  }
  throw new Error(`${label} ${timeoutMs}ms içinde açılmadı`);
}

const only = process.argv.slice(2); // ör: j050 j051

async function main() {
  // 0) Eski API/web süreçlerini zorla kapat (stale instance → yeni spawn EADDRINUSE'u önle)
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const pids = [...new Set(out.split('\n').filter((l) => /:300[01]\s/.test(l) && /LISTENING/i.test(l)).map((l) => l.trim().split(/\s+/).pop()))];
    for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
  } catch {}

  // 1) API build (stabil node dist/main için)
  console.log('▶ API build...');
  sh('pnpm --filter @tarodan/api build', { cwd: ROOT });

  // 2) DB'yi BİR KEZ kur (reset+seed+stok+snapshot)
  console.log('▶ DB kurulumu (migrate reset + seed + stok + snapshot)...');
  sh('pnpm exec prisma migrate reset --force --skip-seed', { cwd: API_DIR, env: SETUP_ENV });
  try { sh('pnpm exec ts-node prisma/seed.ts', { cwd: API_DIR, env: SETUP_ENV }); }
  catch { console.warn('  seed non-zero (temel veri oluşmuş olmalı)'); }
  psql("UPDATE products SET quantity=100000 WHERE status='active'");
  psql('DROP TABLE IF EXISTS _seed_products; CREATE TABLE _seed_products AS SELECT id FROM products; DROP TABLE IF EXISTS _seed_users; CREATE TABLE _seed_users AS SELECT id FROM users; DROP TABLE IF EXISTS _seed_memberships; CREATE TABLE _seed_memberships AS SELECT * FROM user_memberships;');

  // 3) STABİL API + WEB başlat (watch yok → restart yok). Log'lar dosyaya → çökme teşhisi.
  const apiLogFd = openSync(path.join(WEB_DIR, 'api-runner.log'), 'w');
  const webLogFd = openSync(path.join(WEB_DIR, 'web-runner.log'), 'w');
  let api;
  const startApi = () => {
    console.log('▶ API başlatılıyor (node dist/main)...');
    api = spawn('node', ['dist/main'], { cwd: API_DIR, env: API_ENV, stdio: ['ignore', apiLogFd, apiLogFd] });
  };
  startApi();
  console.log('▶ WEB başlatılıyor (next dev :3000)...');
  const web = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', '3000'], { cwd: WEB_DIR, env: { ...process.env }, stdio: ['ignore', webLogFd, webLogFd] });
  const cleanup = () => { try { api?.kill('SIGKILL'); } catch {} try { web.kill('SIGKILL'); } catch {} };
  process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(1); });

  await waitFor(API_URL, 'API');
  await waitFor(WEB_URL, 'WEB');

  // API dayanıklılık. EADDRINUSE'u kökten önle: 3001 LISTENING ise API CANLI (yavaş olabilir)
  // → İKİNCİ instance ASLA açma. Ölmüşse/stuck ise önce 3001'i taskkill ile zorla boşalt, SONRA spawn.
  const httpOk = async (url) => { try { const r = await fetch(url); return r.ok || r.status === 200; } catch { return false; } };
  const portListening = () => {
    try {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      return out.split('\n').some((l) => /:3001\s/.test(l) && /LISTENING/i.test(l));
    } catch { return false; }
  };
  const killPort3001 = () => {
    try { api?.kill('SIGKILL'); } catch {}
    try {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const pids = [...new Set(out.split('\n').filter((l) => /:3001\s/.test(l) && /LISTENING/i.test(l)).map((l) => l.trim().split(/\s+/).pop()))];
      for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
    } catch {}
  };
  const ensureApi = async () => {
    for (let k = 0; k < 20; k++) { if (await httpOk(API_URL)) return; await sleep(1500); } // ~30sn tolerans
    if (portListening()) {
      // API canlı ama stuck → İKİNCİ instance açma. Daha uzun bekle.
      console.warn('  ⚠ API stuck (port LISTENING) — restart YOK, bekleniyor');
      for (let k = 0; k < 30; k++) { if (await httpOk(API_URL)) return; await sleep(2000); } // +60sn
      console.warn('  ⚠ hâlâ stuck → 3001 zorla kapat + restart');
    } else {
      console.warn('  ⚠ API ölmüş → restart');
    }
    killPort3001();
    for (let k = 0; k < 30; k++) { if (!portListening()) break; await sleep(500); } // port boşalsın
    await sleep(1000);
    startApi();
    await waitFor(API_URL, 'API(restart)', 90000);
  };
  const resetState = async () => {
    for (let k = 0; k < 6; k++) {
      try { const r = await fetch('http://localhost:3001/api/dev/reset-state', { method: 'POST' }); if (r.ok) { const j = await r.json().catch(() => ({})); if (j.ahmetTier !== 'premium' || j.offersAfter > 0 || j.truncated === 0) console.warn(`  ⚠ reset ahmetTier=${j.ahmetTier} truncated=${j.truncated} offersAfter=${j.offersAfter} snap=${j.snapshot} ${j.dbInfo}`); return true; } console.warn(`  reset-state HTTP ${r.status}`); }
      catch { /* API meşgul (reset/GC) — bekle */ }
      await sleep(2000);
      if (k === 3) await ensureApi(); // 4 denemeden sonra hâlâ yoksa API'yi kurtar
    }
    return false;
  };

  // 4) Journey listesi
  let journeys = readdirSync(JOURNEY_DIR).filter((f) => /^j\d{3}.*\.spec\.ts$/.test(f)).sort();
  if (only.length) journeys = journeys.filter((f) => only.some((o) => f.startsWith(o)));
  console.log(`\n▶ ${journeys.length} journey, her biri 0'dan izole koşacak.\n`);

  const results = [];
  let i = 0;
  for (const f of journeys) {
    i++;
    // Periyodik temiz restart — uzun koşuda connection/memory degrade'i (flaky 403/ECONNRESET) önle.
    if (i > 1 && (i - 1) % 20 === 0) {
      console.log('  ↻ periyodik API restart (degrade önle)');
      killPort3001();
      for (let k = 0; k < 30; k++) { if (!portListening()) break; await sleep(500); }
      await sleep(1000);
      startApi();
      await waitFor(API_URL, 'API(periyodik)', 90000);
    }
    // 0'dan: DB'yi seed-temiz haline döndür (API düşmüşse restart + retry)
    await resetState();

    let status = 'PASS', detail = '';
    try {
      execSync(`npx playwright test journeys/${f} --reporter=line`, {
        cwd: WEB_DIR, env: { ...process.env, E2E_SKIP_SETUP: '1' }, stdio: 'pipe',
      });
    } catch (e) {
      status = 'FAIL';
      const out = ((e.stdout?.toString() || '') + (e.stderr?.toString() || '')).replace(/\x1b\[[0-9;]*m/g, '');
      const lines = out.split('\n').map((l) => l.trim());
      const errLine = lines.find((l) => /^Error: /.test(l)) || lines.find((l) => /expect\(|Timeout|ECONN/.test(l)) || '';
      const loc = (lines.find((l) => /j\d{3}[a-z0-9-]*\.spec\.ts:\d+/.test(l)) || '').match(/j\d{3}[a-z0-9-]*\.spec\.ts:\d+/)?.[0] || '';
      detail = `${loc ? '@' + loc.replace(/^.*\.spec\.ts/, '') + ' ' : ''}${errLine}`.slice(0, 200);
    }
    results.push({ f, status, detail });
    console.log(`[${i}/${journeys.length}] ${status === 'PASS' ? '✅' : '❌'} ${f}${detail ? '  — ' + detail : ''}`);

    // her adımda incremental yaz (uzun koşuda ara sonuç kaybolmasın)
    writeResults(results);
  }

  writeResults(results);
  const pass = results.filter((r) => r.status === 'PASS').length;
  console.log(`\n=== BİTTİ: ${pass}/${results.length} PASS ===`);
  console.log(`Sonuç: ${path.join(WEB_DIR, 'e2e-results.md')}`);
  cleanup();
  process.exit(0);
}

function writeResults(results) {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const md = [
    `# E2E sonuçları — her journey 0'dan izole koşuldu`,
    '',
    `**${pass} / ${results.length} PASS** (stabil API + per-journey reset)`,
    '',
    '| Sonuç | Journey | Neden (fail ise) |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.status === 'PASS' ? '✅' : '❌'} | \`${r.f}\` | ${r.detail.replace(/\|/g, '\\|')} |`),
  ].join('\n');
  writeResults._path ??= path.join(WEB_DIR, 'e2e-results.md');
  writeFileSync(writeResults._path, md);
}

main().catch((e) => { console.error(e); process.exit(1); });
