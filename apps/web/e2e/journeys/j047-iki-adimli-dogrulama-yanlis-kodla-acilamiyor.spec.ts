/**
 * J47 — İki adımlı doğrulama yanlış kodla açılamıyor
 * 2FA enable → yanlış kod ile verify reddedilir (etkinleşmez) → doğru TOTP ile etkinleşir.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe } from '../support/helpers';
import { dbFind } from '../support/db';
import { auth, totpCode } from '../support/journeys-extra';

test.describe('J47 — Yanlış kod 2FA açamaz, doğru kod açar', () => {
  test('enable → yanlış kod verify red (kapalı kalır) → doğru TOTP ile etkin', async ({ request }) => {
    test.setTimeout(45_000);
    const token = await apiLogin(request, USERS.sellerFree);
    const me = await apiMe(request, token);

    // 1) 2FA aç → secret + QR
    const enable = await request.post(`${API}/security/2fa/enable`, { headers: auth(token), data: {} });
    expect(enable.ok(), '2fa enable').toBeTruthy();
    const enBody = await enable.json();
    expect(enBody.secret, 'secret döndü').toBeTruthy();

    // 2) Yanlış kod ile verify → 401/400, etkinleşmez
    const bad = await request.post(`${API}/security/2fa/verify`, {
      headers: auth(token),
      data: { code: '000000' },
    });
    expect(bad.ok(), 'yanlış kod reddedilmeli').toBeFalsy();
    expect([400, 401, 422]).toContain(bad.status());
    const rowBad = await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true });
    expect(rowBad?.isEnabled, 'yanlış kod sonrası hâlâ kapalı').toBe(false);

    // 3) Doğru TOTP ile verify → etkinleşir
    const ok = await request.post(`${API}/security/2fa/verify`, {
      headers: auth(token),
      data: { code: totpCode(enBody.secret) },
    });
    expect(ok.ok(), 'doğru TOTP ile etkinleşir').toBeTruthy();
    const rowOk = await dbFind(request, 'twoFactorSecret', { userId: me.id }, { isEnabled: true });
    expect(rowOk?.isEnabled, '2fa etkinleşti').toBe(true);

    // Temizlik: 2FA'yı kapat (seed kullanıcı durumunu bozmamak için)
    await request.post(`${API}/security/2fa/disable`, {
      headers: auth(token),
      data: { code: totpCode(enBody.secret) },
    }).catch(() => {});
  });
});
