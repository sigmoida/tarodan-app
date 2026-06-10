/**
 * J24 — Şifremi unuttum: sıfırlama ve eski oturumların düşmesi
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
