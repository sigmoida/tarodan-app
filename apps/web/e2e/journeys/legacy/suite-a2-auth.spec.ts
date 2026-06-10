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

// =============================================================================
// J46 — Şifre değiştirme: yanlış mevcut şifre + zayıf yeni şifre engeli
// Manuel tur: giriş → yanlış mevcut şifre (red) → doğru mevcut + zayıf yeni (red)
//             → güçlü yeni (kabul) → yeni şifre ile yeniden giriş.
// Endpoint: POST /security/password/change { currentPassword, newPassword } (auth'lu).
// Yeni şifre regex: en az 8, büyük+küçük+rakam+özel(@$!%*?&).
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

    // 1) Üye giriş yaptı.
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

// =============================================================================
// J118 — Profil ve adres doğrulamaları + adres IDOR
// Manuel tur: geçersiz telefon (red) → 500+ karakter bio (red) → geçerli güncelleme
//             → adres ekle/varsayılan yap/güncelle → başkasının adresini güncelle (engel).
// Endpoint: PATCH /users/me ; POST/PATCH /users/me/addresses(/:id)
// phone regex ^\+90[0-9]{10}$ ; bio MaxLength(500).
// =============================================================================
test.describe('J118 — Profil/adres doğrulama + adres IDOR', () => {
  test('geçersiz profil reddedilir, adres CRUD çalışır, başkasının adresi engellenir', async ({ request }) => {
    test.setTimeout(60_000);

    // A kullanıcısı (buyerClean = deniz) ve B kullanıcısı (newMember = ceren) — IDOR için iki ayrı hesap.
    const tokenA = await apiLogin(request, USERS.buyerClean);
    const headersA = { Authorization: `Bearer ${tokenA}` };
    const meA = await apiMe(request, tokenA);

    // 1) Geçersiz telefon biçimi → reddedilir (regex ^\+90[0-9]{10}$).
    const badPhone = await request.patch(`${API}/users/me`, {
      headers: headersA,
      data: { phone: '12345' },
    });
    expect(badPhone.ok(), 'geçersiz telefon reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(badPhone.status());

    // 2) 500 karakterden uzun biyografi → reddedilir (MaxLength 500).
    const longBio = 'x'.repeat(501);
    const badBio = await request.patch(`${API}/users/me`, {
      headers: headersA,
      data: { bio: longBio },
    });
    expect(badBio.ok(), '500+ bio reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(badBio.status());

    // 3) Geçerli bilgilerle profili güncelle → kabul; DB/cevapta değer yansır.
    const newBio = 'E2E J118 geçerli biyografi ' + Date.now();
    const goodPhone = '+90' + uniquePhone();
    const goodUpd = await request.patch(`${API}/users/me`, {
      headers: headersA,
      data: { bio: newBio, phone: goodPhone, displayName: 'Deniz J118' },
    });
    expect(goodUpd.ok(), 'geçerli profil güncelleme 200').toBeTruthy();
    const meAfter = await apiMe(request, tokenA);
    expect(meAfter?.bio, 'bio güncellendi').toBe(newBio);

    // 4) Yeni adres ekle → varsayılan yap → güncelle.
    const beforeCount = await dbCount(request, 'address', { userId: meA.id });
    const addRes = await request.post(`${API}/users/me/addresses`, {
      headers: headersA,
      data: {
        title: 'Ev',
        fullName: 'Deniz Test',
        phone: '5551234567',
        city: 'İstanbul',
        district: 'Kadıköy',
        address: 'Caferağa Mah. Moda Cad. No:1 D:2',
        zipCode: '34710',
        isDefault: true,
      },
    });
    expect(addRes.ok(), 'adres eklendi (201/200)').toBeTruthy();
    const created = await addRes.json();
    const addressId = created?.id ?? created?.data?.id;
    expect(addressId, 'oluşan adres id').toBeTruthy();

    const afterCount = await dbCount(request, 'address', { userId: meA.id });
    expect(afterCount, 'adres sayısı arttı').toBe(beforeCount + 1);

    // DB: adres A kullanıcısına ait ve varsayılan.
    const dbAddr = await dbFind(
      request, 'address', { id: addressId },
      { id: true, userId: true, isDefault: true, district: true },
    );
    expect(dbAddr?.userId, 'adres sahibi A').toBe(meA.id);
    expect(dbAddr?.isDefault, 'varsayılan adres').toBe(true);

    // Güncelle (ilçe değiştir) → DB'de yansır.
    const upd = await request.patch(`${API}/users/me/addresses/${addressId}`, {
      headers: headersA,
      data: { district: 'Üsküdar' },
    });
    expect(upd.ok(), 'adres güncellendi').toBeTruthy();
    const dbAddr2 = await dbFind(request, 'address', { id: addressId }, { district: true });
    expect(dbAddr2?.district, 'ilçe güncellendi').toBe('Üsküdar');

    // 5) Başkasının (A'nın) adresini B güncellemeye çalışır → engellenir (IDOR 403/404).
    const tokenB = await apiLogin(request, USERS.newMember);
    const headersB = { Authorization: `Bearer ${tokenB}` };
    const idor = await request.patch(`${API}/users/me/addresses/${addressId}`, {
      headers: headersB,
      data: { district: 'Saldırı' },
    });
    expect(idor.ok(), 'B, A’nın adresini güncelleyememeli (IDOR)').toBeFalsy();
    expect([400, 403, 404]).toContain(idor.status());

    // DB: adres B'nin denemesinden etkilenmedi, A'da ve son geçerli değerde kaldı.
    const dbAddr3 = await dbFind(request, 'address', { id: addressId }, { userId: true, district: true });
    expect(dbAddr3?.userId, 'adres hâlâ A’ya ait').toBe(meA.id);
    expect(dbAddr3?.district, 'ilçe IDOR’dan etkilenmedi').toBe('Üsküdar');

    // Temizlik: oluşturulan test adresini sil (seed/diğer testlere sızma olmasın).
    await request.delete(`${API}/users/me/addresses/${addressId}`, { headers: headersA }).catch(() => {});
  });
});
