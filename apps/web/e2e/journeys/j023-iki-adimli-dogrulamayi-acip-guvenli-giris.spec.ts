/**
 * J23 — İki adımlı doğrulamayı açıp güvenli giriş
 * Gerçek backend: /security/2fa/enable → QR + 10 yedek kod, doğru TOTP ile verify
 * (etkinleşir), backup-codes yenilenir, sonra doğru TOTP ile disable.
 * TOTP, security.service.ts'teki özel algoritmanın replikasıyla üretilir (totpCode).
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe } from '../support/helpers';
import { dbFind } from '../support/db';
import { auth, totpCode } from '../support/journeys-extra';

test.describe('J23 — 2FA aç, doğrula, yedek kod yenile, kapat', () => {
  test('enable → QR+10 yedek kod → TOTP verify (etkin) → backup yenile → disable', async ({ request }) => {
    test.setTimeout(45_000);
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);

    // Temiz başlangıç: 2FA etkinse kapatmak için önce status'a bak (kayıt yoksa enable temiz olur)
    const status0 = await request.get(`${API}/security/2fa/status`, { headers: auth(token) });
    expect(status0.ok(), '2fa status erişilebilir').toBeTruthy();

    // 1-2) 2FA aç → secret + QR + 10 yedek kod döner; isEnabled=false (henüz doğrulanmadı)
    const enable = await request.post(`${API}/security/2fa/enable`, { headers: auth(token), data: {} });
    expect(enable.ok(), '2fa enable').toBeTruthy();
    const enBody = await enable.json();
    expect(enBody.secret, 'TOTP secret döndü').toBeTruthy();
    expect(enBody.qrCodeUrl ?? enBody.qrCode, 'QR kodu döndü').toBeTruthy();
    expect(Array.isArray(enBody.backupCodes) && enBody.backupCodes.length, '10 yedek kod').toBe(10);

    const rowBefore = await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true });
    expect(rowBefore?.isEnabled, 'doğrulanana kadar etkin değil').toBe(false);

    // 3) Doğru TOTP ile verify → etkinleşir
    const verify = await request.post(`${API}/security/2fa/verify`, {
      headers: auth(token),
      data: { code: totpCode(enBody.secret) },
    });
    expect(verify.ok(), '2fa verify (doğru TOTP)').toBeTruthy();
    const rowAfter = await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true });
    expect(rowAfter?.isEnabled, '2fa etkinleşti').toBe(true);

    // 5) Yedek kodları yenile (10 yeni kod) — doğru TOTP gerekir
    const regen = await request.post(`${API}/security/2fa/backup-codes`, {
      headers: auth(token),
      data: { code: totpCode(enBody.secret) },
    });
    expect(regen.ok(), 'yedek kod yenileme').toBeTruthy();
    const regenBody = await regen.json();
    const newCodes = Array.isArray(regenBody) ? regenBody : regenBody.backupCodes;
    expect(Array.isArray(newCodes) && newCodes.length, '10 yeni yedek kod').toBe(10);

    // 6) Doğru TOTP ile 2FA kapat
    const disable = await request.post(`${API}/security/2fa/disable`, {
      headers: auth(token),
      data: { code: totpCode(enBody.secret) },
    });
    expect(disable.ok(), '2fa disable').toBeTruthy();
    const rowOff = await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true });
    expect(rowOff?.isEnabled, '2fa kapandı').toBe(false);
  });
});
