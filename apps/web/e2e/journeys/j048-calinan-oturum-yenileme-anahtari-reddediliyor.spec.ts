/**
 * J48 — Çalınan oturum: yenileme anahtarı reddediliyor
 * Kaynak: suite-a-auth.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE A — Auth & Hesap (kısım 1): J42, J24, J48, J119.
 * Gerçek backend + tarodan_test + GERÇEK Mailhog (şifre sıfırlama maili okunur).
 * 2FA (J23/J47), change-password (J46), verify-expired (J45) ayrı eklenecek.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, fillRegisterForm, uniqueEmail } from '../support/helpers';
import { getLastEmailTo, extractLink, clearMailbox } from '../support/mail';

// ───────────── J42 — Yaş sınırı: 18 altı alınmıyor, 18+ kabul ─────────────

test.describe('J48 — Refresh token güvenliği', () => {
  test('sahte/bozuk refresh reddedilir, geçerli refresh tazeler', async ({ request }) => {
    // Sahte imzalı/çöp refresh → 401
    const forged = await request.post(`${API}/auth/refresh`, { data: { refreshToken: 'sahte.cop.token' } });
    expect(forged.ok(), 'sahte refresh reddedilmeli').toBeFalsy();
    expect([400, 401]).toContain(forged.status());

    // Gerçek login → geçerli refresh → yeni access token
    const loginRes = await request.post(`${API}/auth/login`, { data: USERS.buyerClean });
    expect(loginRes.ok()).toBeTruthy();
    const refreshToken = (await loginRes.json())?.tokens?.refreshToken;
    expect(refreshToken, 'refreshToken alındı').toBeTruthy();

    const refreshed = await request.post(`${API}/auth/refresh`, { data: { refreshToken } });
    expect(refreshed.ok(), 'geçerli refresh tazeler').toBeTruthy();
    const rb = await refreshed.json();
    const newAccess = rb?.accessToken ?? rb?.tokens?.accessToken; // refresh düz {accessToken} döner
    expect(newAccess, 'yeni accessToken').toBeTruthy();
  });
});
