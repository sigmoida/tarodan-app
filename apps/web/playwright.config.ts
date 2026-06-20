import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/legacy/**'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // sıralı: gerçek DB + escrow/stok state'i izole tutmak için
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.E2E_LITE ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    // Hata izlenebilirliği (Kural 6): trace + video + ekran görüntüsü HER testte saklanır (sunum/arşiv).
    // E2E_LITE=1 ile hızlı koşu moduna geç (CI rapor arşivi için kapalı tutma).
    trace: process.env.E2E_LITE ? 'off' : 'on',
    video: process.env.E2E_LITE ? 'off' : 'on',
    screenshot: process.env.E2E_LITE ? 'off' : 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Backend API on :3001 — NODE_ENV=test → .env.test (tarodan_test + Mailhog) + DevModule.
      command: 'cd ../api && pnpm dev',
      url: 'http://localhost:3001/api/health',
      // .env.test PORT=0 (Jest in-memory için) → 3001'e sabitle. PAYMENT_BYPASS varsayılan
      // true (suite hemen koşsun); AKTİF PayTR sandbox creds geldiğinde
      // E2E_PAYMENT_BYPASS=false ile gerçek PayTR yoluna geç.
      // process.env (shell) .env dosyalarını ezebildiği için test-kritik değerleri BURADA
      // zorla: tarodan_test DB + Mailhog SMTP. Aksi halde shell'deki SMTP_HOST=gmail veya
      // yanlış DATABASE_URL sızıp test API'sini bozar (yanlış DB / gerçek mail gönderimi).
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        PAYMENT_BYPASS: process.env.E2E_PAYMENT_BYPASS ?? 'true',
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tarodan_test?schema=public',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASS: '',
        SENDGRID_API_KEY: '',
        MAIL_FROM: 'no-reply@tarodan.test',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Next.js web on :3000
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
