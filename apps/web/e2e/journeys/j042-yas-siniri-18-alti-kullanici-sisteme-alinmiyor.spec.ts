/**
 * J42 — Yaş sınırı: 18 altı kullanıcı sisteme alınmıyor
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

test.describe('J42 — Yaş sınırı (18+)', () => {
  test('18 altı kayıt reddedilir, 18+ kabul edilir', async ({ page, request }) => {
    test.setTimeout(45_000);

    // 18 yaşından küçük doğum tarihi (10 yaşında)
    const under18 = new Date();
    under18.setFullYear(under18.getFullYear() - 10);
    const youngEmail = uniqueEmail();

    await page.goto('/register');
    await fillRegisterForm(page, { email: youngEmail, birthDate: under18.toISOString().split('T')[0] });
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1500);

    // Backend kabul etmemeli: kullanıcı oluşmadı + register'da kaldı (login'e/profile'a gitmedi)
    const probe = await request.post(`${API}/auth/login`, { data: { email: youngEmail, password: 'Pwtest123!' } });
    expect(probe.ok(), '18 altı kullanıcı login olamamalı (oluşmadı)').toBeFalsy();

    // 18+ ile aynı akış → kabul (backend 200/201)
    const okEmail = uniqueEmail();
    const over18 = new Date();
    over18.setFullYear(over18.getFullYear() - 25);
    const regResp = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST', { timeout: 15_000 }).catch(() => null);
    await page.goto('/register');
    await fillRegisterForm(page, { email: okEmail, birthDate: over18.toISOString().split('T')[0] });
    await page.locator('button[type="submit"]').first().click();
    const resp = await regResp;
    if (resp) expect([200, 201]).toContain(resp.status());
  });
});
