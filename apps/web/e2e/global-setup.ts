/**
 * Playwright global-setup — HER KOŞUDA `tarodan_test` DB'yi SIFIRLAYIP yeniden seed eder
 * (temiz state; journey'ler arası rezervasyon/sipariş çakışması olmasın).
 * oluştur (yoksa) → prisma migrate reset --force → seed. NODE_ENV=test + SEED_SKIP_IMAGES=1.
 */
import { execSync } from 'child_process';
import * as path from 'path';

const TEST_DB =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/tarodan_test?schema=public';

export default async function globalSetup(): Promise<void> {
  // Runner (run-each.mjs) kurulumu + per-journey reset'i kendi yönetir → her invocation'da
  // migrate reset tekrarlanmasın diye atla.
  if (process.env.E2E_SKIP_SETUP === '1') {
    console.log('[e2e] E2E_SKIP_SETUP=1 — global setup atlandı (runner yönetiyor)');
    return;
  }
  const apiDir = path.resolve(__dirname, '../../api');
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DB,
    NODE_ENV: 'test',
    SEED_SKIP_IMAGES: '1',
  } as NodeJS.ProcessEnv;

  // 1) tarodan_test yoksa oluştur. Yerelde docker postgres container'ı üzerinden; CI'da
  //    servis container'ı DB'yi (POSTGRES_DB) zaten yaratır → bu adımın hata vermesi zararsız.
  try {
    execSync(
      `docker exec tarodan-postgres sh -c "psql -U postgres -tc \\"SELECT 1 FROM pg_database WHERE datname='tarodan_test'\\" | grep -q 1 || createdb -U postgres tarodan_test"`,
      { stdio: 'inherit' },
    );
  } catch (e) {
    console.warn('[e2e] createdb tarodan_test atlandı (CI servis DB veya zaten var):', (e as Error).message);
  }

  // 2) HER KOŞUDA temiz state: şema+veri sıfırla + migration'ları yeniden uygula
  console.log('[e2e] migrate reset (sıfırla) → tarodan_test');
  execSync('pnpm exec prisma migrate reset --force --skip-seed', { cwd: apiDir, env, stdio: 'inherit' });

  // 3) Seed (görseller atlanır). Reset sonrası temiz veri.
  console.log('[e2e] seed → tarodan_test');
  try {
    execSync('pnpm exec ts-node prisma/seed.ts', { cwd: apiDir, env, stdio: 'inherit' });
  } catch (e) {
    console.warn('[e2e] seed non-zero exit (temel veri oluşmuş olmalı):', (e as Error).message);
  }

  // 4+5) Post-seed hazırlık (stok yükseltme + seed snapshot tabloları) — ORTAM BAĞIMSIZ.
  //    docker-exec yerine prisma client üzerinden çalışır → hem yerel hem CI'da aynı.
  //    Stok-bitti journey'leri (J12/J13/J61/J102/J127) kendi düşük stoğunu dev-hook ile ayarlar.
  execSync('pnpm exec ts-node prisma/e2e-prepare.ts', { cwd: apiDir, env, stdio: 'inherit' });

  console.log('[e2e] test DB hazır.');
}
