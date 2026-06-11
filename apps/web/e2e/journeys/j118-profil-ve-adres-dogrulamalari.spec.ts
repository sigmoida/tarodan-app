/**
 * J118 — Profil ve adres doğrulamaları
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
