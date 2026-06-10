/**
 * J46 — Şifre değiştirme: yanlış mevcut şifre engeli
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

test.describe('J46 — Şifre değiştirme (yanlış mevcut + zayıf yeni)', () => {
  // Yeni üyeyle çalışır (seed kullanıcılarının şifresini kalıcı bozmamak için
  // kendi oluşturduğumuz hesap üzerinde değiştirir, sonra eskiye döndürürüz değil —
  // taze hesap olduğundan seed tutarlılığını etkilemez).
  test('yanlış mevcut ve zayıf yeni reddedilir, güçlü yeni kabul edilir', async ({ request }) => {
    test.setTimeout(60_000);

    // 0) Akışın izole olması için taze bir hesap kur.
    const email = uniqueEmail();
    const oldPassword = 'Pwtest123!';
    const reg = await request.post(`${API}/auth/register`, {
      data: { email, password: oldPassword, displayName: 'Pwd Change', birthDate: birthdayOver18(), phone: '+90' + uniquePhone() },
    });
    expect(reg.ok(), 'kayıt 201').toBeTruthy();

    // 1) Email doğrulama login öncesi zorunlu (app davranışı). Gerçek kullanıcının maildeki
    //    linke tıklaması yerine test kısayolu: kullanıcıyı verified işaretle, sonra giriş yap.
    await backdate(request, 'user', { email }, { isEmailVerified: true, isVerified: true });
    const token = await apiLogin(request, { email, password: oldPassword });
    const headers = { Authorization: `Bearer ${token}` };

    // 2) Mevcut şifre YANLIŞ → reddedilir (401 "Mevcut şifre yanlış").
    const wrongCurrent = await request.post(`${API}/security/password/change`, {
      headers,
      data: { currentPassword: 'TamamenYanlis1!', newPassword: 'Strong123!' },
    });
    expect(wrongCurrent.ok(), 'yanlış mevcut şifre reddedilmeli').toBeFalsy();
    expect([400, 401, 403]).toContain(wrongCurrent.status());

    // Şifre değişmedi: eski şifreyle hâlâ giriş yapılabilir.
    const stillOld = await request.post(`${API}/auth/login`, { data: { email, password: oldPassword } });
    expect(stillOld.ok(), 'yanlış mevcut sonrası eski şifre hâlâ geçerli').toBeTruthy();

    // 3) Doğru mevcut + ZAYIF yeni şifre → reddedilir (400, validation: regex/length).
    const weakNew = await request.post(`${API}/security/password/change`, {
      headers,
      data: { currentPassword: oldPassword, newPassword: 'zayif' },
    });
    expect(weakNew.ok(), 'zayıf yeni şifre reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(weakNew.status());

    // Hâlâ değişmedi.
    const stillOld2 = await request.post(`${API}/auth/login`, { data: { email, password: oldPassword } });
    expect(stillOld2.ok(), 'zayıf yeni sonrası eski şifre hâlâ geçerli').toBeTruthy();

    // 4) Güçlü yeni şifre → kabul (200), şifre değişti.
    const newPassword = 'Strong123!'; // büyük+küçük+rakam+özel(!)
    const ok = await request.post(`${API}/security/password/change`, {
      headers,
      data: { currentPassword: oldPassword, newPassword },
    });
    expect(ok.ok(), 'güçlü yeni şifre kabul edilmeli').toBeTruthy();

    // 5) Eski şifre artık çalışmaz, yeni şifreyle giriş başarılı → akış bitti.
    const oldFails = await request.post(`${API}/auth/login`, { data: { email, password: oldPassword } });
    expect(oldFails.ok(), 'eski şifre artık geçersiz').toBeFalsy();

    const newWorks = await request.post(`${API}/auth/login`, { data: { email, password: newPassword } });
    expect(newWorks.ok(), 'yeni şifre ile login başarılı').toBeTruthy();
  });
});
