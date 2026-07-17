import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { disconnectPrisma, getPrisma } from '../test-utils/db';

/**
 * #232 — public force-update gate. GET /api/app-config advertises the minimum
 * supported app version per platform (operator-tunable via PlatformSetting,
 * no redeploy) and optionally computes updateRequired/updateAvailable for a
 * supplied client version.
 */
const KEYS = [
  'min_supported_app_version_ios',
  'min_supported_app_version_android',
  'latest_app_version_ios',
  'latest_app_version_android',
];

describe('App Config — force-update gate (E2E) [#232]', () => {
  let ctx: E2ETestApp;
  const prisma = getPrisma();

  const setSetting = (key: string, value: string) =>
    prisma.platformSetting.upsert({
      where: { settingKey: key },
      update: { settingValue: value, settingType: 'string' },
      create: { settingKey: key, settingValue: value, settingType: 'string' },
    });

  const clearSettings = () =>
    prisma.platformSetting.deleteMany({ where: { settingKey: { in: KEYS } } });

  const get = (query?: Record<string, string>) =>
    request(ctx.app.getHttpServer()).get('/api/app-config').query(query ?? {});

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  beforeEach(async () => {
    await clearSettings();
  });

  afterAll(async () => {
    await clearSettings();
    await ctx.close();
    await disconnectPrisma();
  });

  it('is public (no auth) and returns default thresholds when unset', async () => {
    const res = await get().expect(200);
    expect(res.body.minSupportedVersion).toEqual({ ios: '1.0.0', android: '1.0.0' });
    expect(res.body.latestVersion).toEqual({ ios: '1.0.0', android: '1.0.0' });
    expect(res.body.updateRequired).toBeNull();
    expect(res.body.updateAvailable).toBeNull();
  });

  it('advertises operator-set min versions per platform (no rebuild needed)', async () => {
    await setSetting('min_supported_app_version_ios', '2.1.0');
    await setSetting('min_supported_app_version_android', '2.0.0');

    const res = await get().expect(200);
    expect(res.body.minSupportedVersion).toEqual({ ios: '2.1.0', android: '2.0.0' });
  });

  it('updateRequired=true when the client is below the minimum', async () => {
    await setSetting('min_supported_app_version_ios', '2.1.0');

    const res = await get({ platform: 'ios', appVersion: '2.0.9' }).expect(200);
    expect(res.body.updateRequired).toBe(true);
  });

  it('updateRequired=false when the client is at/above the minimum', async () => {
    await setSetting('min_supported_app_version_ios', '2.1.0');

    const res = await get({ platform: 'ios', appVersion: '2.1.0' }).expect(200);
    expect(res.body.updateRequired).toBe(false);
  });

  it('compares version segments numerically (1.10.0 > 1.9.0)', async () => {
    await setSetting('min_supported_app_version_android', '1.10.0');

    const below = await get({ platform: 'android', appVersion: '1.9.0' }).expect(200);
    expect(below.body.updateRequired).toBe(true);

    const above = await get({ platform: 'android', appVersion: '1.11.0' }).expect(200);
    expect(above.body.updateRequired).toBe(false);
  });

  it('flags updateAvailable when a newer non-forced version exists', async () => {
    await setSetting('min_supported_app_version_ios', '1.0.0');
    await setSetting('latest_app_version_ios', '3.0.0');

    const res = await get({ platform: 'ios', appVersion: '2.0.0' }).expect(200);
    expect(res.body.updateRequired).toBe(false);
    expect(res.body.updateAvailable).toBe(true);
  });

  it('rejects a malformed appVersion (400)', async () => {
    await get({ platform: 'ios', appVersion: 'not-a-version' }).expect(400);
  });

  it('rejects an invalid platform (400)', async () => {
    await get({ platform: 'windows', appVersion: '1.0.0' }).expect(400);
  });
});
