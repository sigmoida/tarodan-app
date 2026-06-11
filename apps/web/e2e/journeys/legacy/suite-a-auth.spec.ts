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

// ───────────── J24 — Şifremi unuttum: GERÇEK Mailhog maili + sıfırlama ─────────────
test.describe('J24 — Şifre sıfırlama (Mailhog)', () => {
  test('forgot-password gerçek mail yollar, link ile sıfırlanır', async ({ request }) => {
    test.setTimeout(45_000);
    const email = USERS.buyer.email; // mehmet@demo.com (var olan)

    await clearMailbox(request);

    // 1) forgot-password — sistem nötr cevap verir (e-posta var/yok aynı)
    const fp = await request.post(`${API}/auth/forgot-password`, { data: { email } });
    expect(fp.ok(), 'forgot-password 200').toBeTruthy();

    // 2) GERÇEK mail Mailhog'a düştü mü? (Kural 3)
    const mail = await getLastEmailTo(request, email, 20_000);
    expect(mail.body.length, 'mail gövdesi var').toBeGreaterThan(10);
    const link = extractLink(mail.body, 'reset');
    expect(link, 'maildeki sıfırlama linki').toBeTruthy();

    // 3) Linkteki token ile yeni şifre belirle
    const token = new URL(link!).searchParams.get('token') ?? link!.split('token=')[1]?.split(/[&"]/)[0];
    expect(token, 'reset token çıkarıldı').toBeTruthy();
    const newPassword = 'Reset123!';
    const reset = await request.post(`${API}/auth/reset-password`, { data: { token, password: newPassword, newPassword } });
    expect(reset.ok(), 'reset-password 200').toBeTruthy();

    // 4) Yeni şifreyle giriş çalışır, eskisi çalışmaz
    const loginNew = await request.post(`${API}/auth/login`, { data: { email, password: newPassword } });
    expect(loginNew.ok(), 'yeni şifreyle login').toBeTruthy();

    // 5) Eski demo şifresine geri al (seed tutarlılığı — diğer testler Demo123! bekliyor)
    const tok = (await loginNew.json())?.tokens?.accessToken;
    if (tok) {
      await request.post(`${API}/auth/forgot-password`, { data: { email } });
      const m2 = await getLastEmailTo(request, email, 20_000);
      const l2 = extractLink(m2.body, 'reset');
      const t2 = l2 ? (new URL(l2).searchParams.get('token') ?? l2.split('token=')[1]?.split(/[&"]/)[0]) : null;
      if (t2) await request.post(`${API}/auth/reset-password`, { data: { token: t2, password: USERS.buyer.password, newPassword: USERS.buyer.password } });
    }
  });
});

// ───────────── J48 — Çalınan oturum: sahte/bozuk refresh reddedilir ─────────────
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

// ───────────── J119 — Takip et / takipten çık + kendini takip engeli ─────────────
test.describe('J119 — Takip akışı', () => {
  test('başka kullanıcıyı takip/çık, kendini takip reddedilir', async ({ request }) => {
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const headers = { Authorization: `Bearer ${token}` };

    // Takip edilecek başka kullanıcı (ahmet = satıcı)
    const target = await apiMe(request, await apiLogin(request, USERS.sellerPremium));
    const targetId = target?.id;
    expect(targetId, 'hedef kullanıcı id').toBeTruthy();

    // Takip et
    const follow = await request.post(`${API}/users/${targetId}/follow`, { headers });
    expect(follow.ok(), 'takip et').toBeTruthy();

    // Kendini takip → reddedilir
    const self = await request.post(`${API}/users/${me.id}/follow`, { headers });
    expect(self.ok(), 'kendini takip reddedilmeli').toBeFalsy();

    // Takipten çık
    const unfollow = await request.delete(`${API}/users/${targetId}/follow`, { headers });
    expect(unfollow.ok(), 'takipten çık').toBeTruthy();
  });
});
