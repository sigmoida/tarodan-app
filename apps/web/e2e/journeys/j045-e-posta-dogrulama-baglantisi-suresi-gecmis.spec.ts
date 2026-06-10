/**
 * J45 — E-posta doğrulama bağlantısı süresi geçmiş
 * Kaynak: suite-a2-auth.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE A2 — Auth & Hesap (kısım 2): J45, J46, J118.
 * Gerçek backend + tarodan_test + GERÇEK Mailhog (doğrulama maili okunur) + dev hook'lar
 * (backdate/find — apps/api/src/modules/dev/dev.controller.ts).
 *
 * Endpoint doğrulamaları (controller'dan):
 *  - POST /auth/register                  (RegisterDto: email, password, displayName, birthDate, phone?)
 *  - POST /auth/verify-email      { token }            (auth.controller.ts:171)  → 400 süresi dolmuş
 *  - POST /auth/resend-verification { email }          (auth.controller.ts:185)
 *  - POST /security/password/change { currentPassword, newPassword } (security.controller.ts:138, auth'lu)
 *  - PATCH /users/me              (UpdateProfileDto: phone ^\+90[0-9]{10}$, bio<=500, displayName)
 *  - POST /users/me/addresses     (CreateAddressDto: fullName, phone, city, district, address)
 *  - PATCH /users/me/addresses/:id (UpdateAddressDto = PartialType)  → IDOR: başkasının adresi 4xx
 *
 * DB modelleri (dev find/backdate, camelCase): emailVerificationToken, address.
 * Doğrulama maili gövdesinde ham token: FRONTEND_URL/verify-email?token=<rawToken>
 * (notification.service.ts:1244). DB'de token sha256 ile hash'li tutulur; bu yüzden
 * "süresi geçmiş" senaryosu için ham token'ı maildan alır, DB satırını backdate ederiz.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, uniqueEmail, uniquePhone, birthdayOver18 } from '../support/helpers';
import { backdate, dbFind, dbCount } from '../support/db';
import { getLastEmailTo, extractLink, clearMailbox } from '../support/mail';

// =============================================================================
// J45 — E-posta doğrulama bağlantısı süresi geçmiş + resend-verification
// Manuel tur: kayıt → mail günlerce açılmadı → tıklanınca süre dolmuş (red) →
//             yeni bağlantı iste → yeni linkle doğrula → giriş yap.
// =============================================================================

test.describe('J45 — Mail doğrulama süresi geçmiş + resend', () => {
  test('süresi dolmuş token reddedilir, resend ile yeni token doğrular', async ({ request }) => {
    test.setTimeout(60_000);

    await clearMailbox(request);

    // 1) Üye kayıt oldu (doğrulama maili tetiklenir, isEmailVerified=false).
    const email = uniqueEmail();
    const password = 'Pwtest123!';
    const reg = await request.post(`${API}/auth/register`, {
      data: {
        email,
        password,
        displayName: 'Verify Expired',
        birthDate: birthdayOver18(),
        phone: '+90' + uniquePhone(),
      },
    });
    expect(reg.ok(), 'kayıt 201').toBeTruthy();

    // Kayıt sonrası doğrulama token satırı oluştu mu? (DB)
    const tokenRow = await dbFind(
      request, 'emailVerificationToken', { email },
      { id: true, userId: true, usedAt: true, expiresAt: true }, { createdAt: 'desc' },
    );
    expect(tokenRow, 'doğrulama token satırı oluştu').toBeTruthy();
    expect(tokenRow.usedAt, 'token henüz kullanılmadı').toBeNull();

    // 2) Mail günlerce açılmadı → ham token'ı maildan al, sonra DB'de süresi geçmiş yap.
    const mail1 = await getLastEmailTo(request, email, 20_000);
    expect(mail1.body.length, 'doğrulama maili düştü').toBeGreaterThan(10);
    const link1 = extractLink(mail1.body, 'verify');
    expect(link1, 'maildeki doğrulama linki').toBeTruthy();
    const rawToken1 = new URL(link1!).searchParams.get('token') ?? link1!.split('token=')[1]?.split(/[&"]/)[0];
    expect(rawToken1, 'ham doğrulama token').toBeTruthy();

    // Zaman yolculuğu: token 2 gün önce geçerliliğini yitirsin.
    const past = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const bd = await backdate(request, 'emailVerificationToken', { email }, { expiresAt: past });
    expect(bd.count, 'token expiresAt geçmişe çekildi').toBeGreaterThan(0);

    // Süresi geçmiş token ile doğrulama → reddedilir (400 "süresi dolmuş").
    const expired = await request.post(`${API}/auth/verify-email`, { data: { token: rawToken1 } });
    expect(expired.ok(), 'süresi geçmiş token reddedilmeli').toBeFalsy();
    expect([400, 410]).toContain(expired.status());

    // E-posta hâlâ doğrulanmadı: süresi geçmiş token usedAt null kaldı (red, kullanılmadı).
    const stillUnused = await dbFind(request, 'emailVerificationToken', { email, usedAt: null }, { id: true });
    expect(stillUnused, 'eski token hâlâ kullanılmamış (reddedildi)').toBeTruthy();

    // 3) Yeni doğrulama bağlantısı istendi (resend). Eski token'lar geçersizleşir, yenisi üretilir.
    await clearMailbox(request);
    const resend = await request.post(`${API}/auth/resend-verification`, { data: { email } });
    expect(resend.ok(), 'resend-verification 200').toBeTruthy();

    // 4) Yeni mail + yeni ham token ile doğrula.
    const mail2 = await getLastEmailTo(request, email, 20_000);
    const link2 = extractLink(mail2.body, 'verify');
    expect(link2, 'yeni doğrulama linki').toBeTruthy();
    const rawToken2 = new URL(link2!).searchParams.get('token') ?? link2!.split('token=')[1]?.split(/[&"]/)[0];
    expect(rawToken2, 'yeni ham token').toBeTruthy();
    expect(rawToken2, 'yeni token eskisinden farklı').not.toEqual(rawToken1);

    const verify = await request.post(`${API}/auth/verify-email`, { data: { token: rawToken2 } });
    expect(verify.ok(), 'yeni token ile doğrulama 200').toBeTruthy();

    // DB: yeni token usedAt damgalandı (doğrulama tamamlandı).
    const usedRow = await dbFind(
      request, 'emailVerificationToken', { email, usedAt: { not: null } },
      { id: true, usedAt: true }, { createdAt: 'desc' },
    );
    expect(usedRow, 'doğrulanan token usedAt damgalı').toBeTruthy();
    expect(usedRow.usedAt, 'usedAt dolu').not.toBeNull();

    // 5) Giriş yaptı, akış tamamlandı.
    const login = await request.post(`${API}/auth/login`, { data: { email, password } });
    expect(login.ok(), 'doğrulanan kullanıcı login olabilir').toBeTruthy();
    const me = await apiMe(request, (await login.json())?.tokens?.accessToken);
    expect(me?.email, 'login eden kullanıcı doğru').toBe(email);
  });
});
