/**
 * Pre-jest setup: load .env.test BEFORE any application code runs.
 *
 * Order matters:
 * 1. We force NODE_ENV=test as the very first thing (db.ts safety check
 *    refuses to TRUNCATE unless this is set).
 * 2. We delete env vars that the dev shell may have leaked in (especially
 *    DATABASE_URL) so .env.test's values take precedence.
 * 3. We load .env.test with override:true.
 * 4. NestJS ConfigModule.forRoot in AppModule still loads .env.local/.env;
 *    by default it does NOT override pre-existing process.env entries, so
 *    our test values survive.
 */

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

process.env.NODE_ENV = 'test';

const ENV_KEYS_TO_RESET = [
  'DATABASE_URL',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'ELASTICSEARCH_NODE',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'PAYTR_MERCHANT_ID',
  'PAYTR_MERCHANT_KEY',
  'PAYTR_MERCHANT_SALT',
  'API_URL',
  'FRONTEND_URL',
  'ADMIN_URL',
  // Dev-only switches that must NOT leak into tests.
  'PAYMENT_BYPASS',
  'SURAT_SOAP_MODE',
  'SURAT_STUB_RESPONSE',
  'SURAT_STUB_THROW',
];

for (const key of ENV_KEYS_TO_RESET) {
  delete process.env[key];
}

const envTestPath = resolve(__dirname, '../../.env.test');
if (!existsSync(envTestPath)) {
  // eslint-disable-next-line no-console
  console.error(`[test-setup] .env.test not found at ${envTestPath}`);
  process.exit(1);
}

const result = loadDotenv({ path: envTestPath, override: true });
if (result.error) {
  // eslint-disable-next-line no-console
  console.error('[test-setup] failed to load .env.test:', result.error);
  process.exit(1);
}

// Safety: refuse to run if DATABASE_URL still points at a non-test database.
if (!process.env.DATABASE_URL || !/_test(\?|$)/.test(process.env.DATABASE_URL)) {
  // eslint-disable-next-line no-console
  console.error(
    `[test-setup] DATABASE_URL must point to a *_test database. Got: ${process.env.DATABASE_URL}`,
  );
  process.exit(1);
}
