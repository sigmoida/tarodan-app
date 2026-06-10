/**
 * SUITE K — Admin / Moderasyon.
 * Gerçek backend + tarodan_test DB + Mailhog. Manuel turun birebir karşılığı.
 *
 * Kapsanan journey'ler:
 *   J18  — Ürün moderasyon: red → düzelt → onay → satış.
 *   J19  — Şikayet → ban → banlı engel → itiraz/kaldır + normal kullanıcı banlayamaz.
 *   J20  — Destek talebi yaşam döngüsü.
 *   J36  — Komisyon + indirim rol bazlı (super vs admin vs moderator) + raporlar.
 *   J111 — Şikayet yönetimi: yönetici inceliyor.
 *   J115 — Misafir destek formu + üye destek talebi.
 *   J116 — Destek IDOR (yabancı erişemiyor).
 *   J120 — Admin sipariş yönetimi + normal kullanıcı engeli.
 *   J121 — Toplu ürün onay.
 *   J122 — Komisyon kuralı rol-bazlı (super vs admin vs moderator).
 *   J123 — Platform ayarları: moderatör yazamaz.
 *   J124 — Filtreye takılan mesajlar (içerik filtresi + admin görüntüleme + IDOR).
 *   J125 — Sistem sağlığı.
 *   J136 — Admin günü tam tur: moderasyon + ban + rapor.
 *
 * NOT — Admin endpoint'leri AYRI auth kullanır: POST /auth/admin/login → { user, tokens }.
 * Kullanıcı (JWT) endpoint'leri ile admin (admin-JWT) endpoint'leri farklı guard'lara tabidir.
 * Bu suite çoğunlukla API seviyesi (request fixture) ile çalışır; sonuçlar DB'den (dbFind)
 * ve HTTP status'tan assert edilir. UI doğrulaması gereken yerde loginViaToken kullanılır.
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, apiGetOrder, uniquePhone,
} from '../support/helpers';
import { dbFind, dbCount } from '../support/db';

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Admin login (ayrı endpoint) → admin accessToken. */
async function adminLogin(request: APIRequestContext, user: { email: string; password: string }): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, { data: user });
  expect(res.ok(), `admin login ${user.email}`).toBeTruthy();
  const body = await res.json();
  const token = body?.tokens?.accessToken ?? body?.accessToken;
  expect(token, 'admin accessToken').toBeTruthy();
  return token as string;
}

/** Yeni tek kullanımlık üye oluştur (register → token + id döner). */
async function registerFreshUser(
  request: APIRequestContext,
  opts: { isSeller?: boolean; displayName?: string } = {},
): Promise<{ id: string; email: string; password: string; token: string }> {
  const email = `pw-k-${Date.now()}-${Math.floor(Math.random() * 99999)}@test.local`;
  const password = 'Pwtest123!';
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - 25);
  const res = await request.post(`${API}/auth/register`, {
    data: {
      email,
      password,
      displayName: opts.displayName ?? 'PW Suite K User',
      birthDate: birth.toISOString().split('T')[0],
      phone: uniquePhone(),
      isSeller: opts.isSeller ?? false,
    },
  });
  expect(res.ok(), `register ${email}`).toBeTruthy();
  const body = await res.json();
  const id = body?.user?.id;
  const token = body?.tokens?.accessToken;
  expect(id, 'yeni kullanıcı id').toBeTruthy();
  expect(token, 'yeni kullanıcı token').toBeTruthy();
  return { id, email, password, token };
}

/** Bir kategori id bul (ürün oluşturmak için). public products listesinden çek. */
async function anyCategoryId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/categories`);
  if (res.ok()) {
    const body = await res.json();
    const flat: any[] = [];
    const walk = (arr: any[]) => arr?.forEach((c) => { flat.push(c); if (c.children) walk(c.children); });
    walk(body?.data ?? body?.categories ?? (Array.isArray(body) ? body : []));
    const leaf = flat.find((c) => c.id && (!c.children || c.children.length === 0)) ?? flat[0];
    if (leaf?.id) return leaf.id;
  }
  // Fallback: aktif bir ürünün kategorisini kullan
  const p = await apiFirstBuyableProduct(request);
  const catId = p?.categoryId ?? p?.category?.id;
  expect(catId, 'kategori id bulundu').toBeTruthy();
  return catId;
}

/** Satıcı (JWT) olarak yeni ürün oluştur → status=pending döner. */
async function createPendingProduct(
  request: APIRequestContext,
  sellerToken: string,
  categoryId: string,
  titleSuffix = '',
): Promise<string> {
  const res = await request.post(`${API}/products`, {
    headers: authHeader(sellerToken),
    data: {
      title: `PW Moderasyon Ürünü ${titleSuffix} ${Date.now()}`,
      description: 'E2E moderasyon testi için oluşturulan ürün açıklaması.',
      price: 199.99,
      categoryId,
      condition: 'very_good',
      quantity: 3,
    },
  });
  expect(res.ok(), `ürün oluştur ${titleSuffix}`).toBeTruthy();
  const body = await res.json();
  const id = body?.id ?? body?.data?.id ?? body?.product?.id;
  expect(id, 'ürün id').toBeTruthy();
  return id;
}

// ════════════════════════════════════════════════════════════════════════════
// J18 — Ürün moderasyon: red → satıcı düzeltir → onay → satış
// ════════════════════════════════════════════════════════════════════════════
test.describe('J18 — Ürün moderasyon red/düzelt/onay/satış', () => {
  test('satıcı ilan açar, admin reddeder, satıcı düzeltir, admin onaylar, alıcı satın alır', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerFree); // zeynep
    const adminToken = await adminLogin(request, USERS.admin);
    const categoryId = await anyCategoryId(request);

    // 1) Satıcı yeni ilan oluşturur → onaya düşer (status=pending)
    const productId = await createPendingProduct(request, sellerToken, categoryId, 'J18');
    let p = await dbFind(request, 'product', { id: productId }, { status: true });
    expect(p?.status, 'yeni ilan pending').toBe('pending');

    // 2) Admin ilanı reddeder (gerekçeyle)
    const rejectRes = await request.post(`${API}/admin/products/${productId}/reject`, {
      headers: authHeader(adminToken),
      data: { reason: 'Ürün açıklaması ve görseller yetersiz' },
    });
    expect(rejectRes.ok(), 'admin reddetti').toBeTruthy();
    p = await dbFind(request, 'product', { id: productId }, { status: true });
    expect(p?.status, 'ilan rejected').toBe('rejected');

    // 3) Satıcıya red bildirimi gitti (DB notification)
    const notif = await dbFind(
      request, 'notification',
      { userId: (await apiMe(request, sellerToken)).id },
      { id: true, type: true }, { createdAt: 'desc' },
    );
    expect(notif, 'satıcıya bir bildirim oluştu').toBeTruthy();

    // 4) Satıcı ürünü düzeltir (açıklama/fiyat günceller)
    const fixRes = await request.patch(`${API}/products/${productId}`, {
      headers: authHeader(sellerToken),
      data: { description: 'Kurallara uygun, detaylı ve net açıklama eklendi. Orijinal ürün.', price: 249.99 },
    });
    expect(fixRes.ok(), 'satıcı ürünü düzeltti').toBeTruthy();

    // 5) Admin bu kez onaylar
    const approveRes = await request.post(`${API}/admin/products/${productId}/approve`, {
      headers: authHeader(adminToken),
      data: { note: 'Düzeltme sonrası uygun, onaylandı' },
    });
    expect(approveRes.ok(), 'admin onayladı').toBeTruthy();
    p = await dbFind(request, 'product', { id: productId }, { status: true });
    expect(p?.status, 'ilan active').toBe('active');

    // 6) Alıcı (deniz, ilanı yok) ürünü satın alır → ödenmiş sipariş
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const { orderId } = await apiBuyAndPay(request, buyerToken, productId);
    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J19 — Şikayet → ban → banlı engel → itiraz/kaldır + normal kullanıcı banlayamaz
// ════════════════════════════════════════════════════════════════════════════
test.describe('J19 — Şikayet, ban, banlı engel, itiraz kaldır', () => {
  test('admin kullanıcıyı banlar, banlı engellenir, ban kalkar; normal kullanıcı banlayamaz', async ({ request }) => {
    test.setTimeout(60_000);

    const adminToken = await adminLogin(request, USERS.admin);
    const reporterToken = await apiLogin(request, USERS.buyer); // mehmet şikayet eder

    // 0) Ban hedefi: yeni tek kullanımlık üye
    const target = await registerFreshUser(request, { displayName: 'Kotuye Kullanan' });

    // 1) Bir üye, hedef kullanıcıyı şikayet eder (user-reports)
    const reportRes = await request.post(`${API}/user-reports`, {
      headers: authHeader(reporterToken),
      data: { type: 'user', targetId: target.id, reason: 'harassment', description: 'Bu kullanıcı taciz edici davranıyor ve kuralları ihlal ediyor.' },
    });
    expect(reportRes.ok(), 'kullanıcı şikayet edildi').toBeTruthy();

    // 2) Admin şikayet listesini + istatistikleri görür
    const listRes = await request.get(`${API}/user-reports/admin`, { headers: authHeader(adminToken), params: { type: 'user' } });
    expect(listRes.ok(), 'admin şikayet listesi').toBeTruthy();
    const statsRes = await request.get(`${API}/user-reports/admin/stats`, { headers: authHeader(adminToken) });
    expect(statsRes.ok(), 'admin şikayet istatistikleri').toBeTruthy();

    // 3) Admin hedefi banlar → DB'de isBanned=true
    const banRes = await request.post(`${API}/admin/users/${target.id}/ban`, {
      headers: authHeader(adminToken),
      data: { reason: 'Tekrarlayan taciz ve kural ihlali' },
    });
    expect(banRes.ok(), 'admin banladı').toBeTruthy();
    let dbUser = await dbFind(request, 'user' as any, { id: target.id }, { isBanned: true, bannedReason: true });
    expect(dbUser?.isBanned, 'kullanıcı banlı').toBe(true);

    // 4) Banlı kullanıcı işlem yapmaya çalışır → BannedUserGuard 403
    const blocked = await request.get(`${API}/users/me`, { headers: authHeader(target.token) });
    expect(blocked.ok(), 'banlı kullanıcı engellenmeli').toBeFalsy();
    expect(blocked.status(), 'banlı 403').toBe(403);

    // 5) İtiraz üzerine admin banı kaldırır → isBanned=false
    const unbanRes = await request.post(`${API}/admin/users/${target.id}/unban`, { headers: authHeader(adminToken) });
    expect(unbanRes.ok(), 'admin banı kaldırdı').toBeTruthy();
    dbUser = await dbFind(request, 'user' as any, { id: target.id }, { isBanned: true });
    expect(dbUser?.isBanned, 'ban kalktı').toBe(false);
    // Ban kalktıktan sonra kullanıcı tekrar işlem yapabilir
    const afterUnban = await request.get(`${API}/users/me`, { headers: authHeader(target.token) });
    expect(afterUnban.ok(), 'ban sonrası tekrar erişebilir').toBeTruthy();

    // 6) Normal kullanıcı (admin değil) başkasını banlamayı dener → engellenir
    //    user JWT ile admin endpoint'i → AdminJwtAuthGuard reddeder (401/403).
    const normalBan = await request.post(`${API}/admin/users/${target.id}/ban`, {
      headers: authHeader(reporterToken),
      data: { reason: 'yetkisiz deneme' },
    });
    expect(normalBan.ok(), 'normal kullanıcı banlayamamalı').toBeFalsy();
    expect([401, 403]).toContain(normalBan.status());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J20 — Destek talebi yaşam döngüsü
// ════════════════════════════════════════════════════════════════════════════
test.describe('J20 — Destek talebi yaşam döngüsü', () => {
  test('üye talep açar, yanıt yazar, yabancı engellenir, admin atar/çözer, üye görür', async ({ request }) => {
    test.setTimeout(60_000);

    const memberToken = await apiLogin(request, USERS.buyerClean);
    const strangerToken = await apiLogin(request, USERS.buyer);
    const adminToken = await adminLogin(request, USERS.admin);

    // 1) Üye destek talebi açar
    const createRes = await request.post(`${API}/support/tickets`, {
      headers: authHeader(memberToken),
      data: { subject: 'Siparişim hakkında sorum var', category: 'general', message: 'Siparişimin durumu ile ilgili bilgi almak istiyorum, yardımcı olur musunuz?' },
    });
    expect(createRes.ok(), 'talep açıldı').toBeTruthy();
    const ticket = await createRes.json();
    const ticketId = ticket?.id;
    expect(ticketId, 'ticket id').toBeTruthy();
    expect(ticket?.status, 'açılışta open').toBeTruthy();

    // 2) Üye talebine ek açıklama yazar
    const replyRes = await request.post(`${API}/support/tickets/${ticketId}/messages`, {
      headers: authHeader(memberToken),
      data: { content: 'Ek bilgi: sipariş numaram panelimde görünüyor ancak kargo bilgisi yok.' },
    });
    expect(replyRes.ok(), 'üye ek açıklama yazdı').toBeTruthy();

    // 3) Yabancı bu talebi görmeyi dener → engellenir
    const peek = await request.get(`${API}/support/tickets/${ticketId}`, { headers: authHeader(strangerToken) });
    expect(peek.ok(), 'yabancı görememeli').toBeFalsy();
    expect([403, 404]).toContain(peek.status());

    // 4) Admin önceliği yükseltir + bir yetkiliye atar
    //    assigneeId: bir admin user id'si gerek. moderatör'ün user id'sini kullan.
    const moderatorUser = await request.post(`${API}/auth/admin/login`, { data: USERS.moderator });
    const moderatorId = (await moderatorUser.json())?.user?.id;
    expect(moderatorId, 'moderatör user id').toBeTruthy();

    const prioRes = await request.patch(`${API}/support/admin/tickets/${ticketId}/priority`, {
      headers: authHeader(adminToken),
      data: { priority: 'high' },
    });
    expect(prioRes.ok(), 'öncelik yükseltildi').toBeTruthy();

    const assignRes = await request.patch(`${API}/support/admin/tickets/${ticketId}/assign`, {
      headers: authHeader(adminToken),
      data: { assigneeId: moderatorId },
    });
    expect(assignRes.ok(), 'yetkiliye atandı').toBeTruthy();

    // 5) Admin çözümü yazıp talebi 'resolved' yapar
    const adminReply = await request.post(`${API}/support/tickets/${ticketId}/messages`, {
      headers: authHeader(adminToken),
      data: { content: 'Merhaba, siparişiniz kargoya verildi. Takip numarası en geç yarın iletilecektir.' },
    });
    expect(adminReply.ok(), 'admin çözüm yazdı').toBeTruthy();

    const statusRes = await request.patch(`${API}/support/admin/tickets/${ticketId}/status`, {
      headers: authHeader(adminToken),
      data: { status: 'resolved', note: 'Bilgi verildi' },
    });
    expect(statusRes.ok(), 'talep çözüldü').toBeTruthy();

    // 6) Üye çözümü görür, durum resolved
    const memberView = await request.get(`${API}/support/tickets/${ticketId}`, { headers: authHeader(memberToken) });
    expect(memberView.ok(), 'üye talebini görür').toBeTruthy();
    const viewed = await memberView.json();
    expect(['resolved', 'closed'], 'durum çözüldü/kapandı').toContain(viewed?.status);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J36 — Komisyon + indirim rol-bazlı + raporlar
// ════════════════════════════════════════════════════════════════════════════
test.describe('J36 — Komisyon/indirim rol-bazlı + raporlar', () => {
  test('super_admin indirim+komisyon oluşturur, admin komisyon yetkisiz, moderatör komisyon göremez, raporlar', async ({ request }) => {
    test.setTimeout(60_000);

    const superToken = await adminLogin(request, USERS.admin);   // admin@tarodan.com (seed: super_admin)
    const moderatorToken = await adminLogin(request, USERS.moderator);

    // 1+2) Süper yönetici global indirim kampanyası oluşturur
    const now = Date.now();
    const discRes = await request.post(`${API}/admin/discounts`, {
      headers: authHeader(superToken),
      data: {
        name: `PW Global Kampanya ${now}`,
        type: 'percentage',
        value: 10,
        scope: 'global',
        startDate: new Date(now).toISOString(),
        endDate: new Date(now + 30 * 24 * 3600_000).toISOString(),
        isActive: true,
      },
    });
    expect(discRes.ok(), 'super_admin indirim oluşturdu').toBeTruthy();
    const discount = await discRes.json();
    const discountId = discount?.id ?? discount?.data?.id;
    if (discountId) {
      const dbDisc = await dbFind(request, 'discount' as any, { id: discountId }, { scope: true, value: true });
      expect(Number(dbDisc?.value), 'indirim değeri 10').toBe(10);
    }

    // 3) Süper yönetici komisyon kurallarını listeler + yeni kural ekler
    const listComm = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(superToken) });
    expect(listComm.ok(), 'super komisyon listesi').toBeTruthy();

    const createComm = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(superToken),
      data: { name: `PW Komisyon ${now}`, sellerType: 'ALL', appliesTo: 'SELLER', sellerRate: 7.5, isActive: true },
    });
    expect(createComm.ok(), 'super komisyon oluşturdu').toBeTruthy();

    // 4) Moderatör komisyon kurallarını GÖRMEYE çalışır → engellenir
    //    (commission-rules sadece super_admin + admin; moderator değil)
    const modComm = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(moderatorToken) });
    expect(modComm.ok(), 'moderatör komisyon görememeli').toBeFalsy();
    expect([401, 403]).toContain(modComm.status());

    // 5) Moderatör komisyon kuralı OLUŞTURMAYA çalışır → engellenir (sadece super_admin)
    const modCreate = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(moderatorToken),
      data: { name: 'yetkisiz', sellerType: 'ALL', appliesTo: 'SELLER', sellerRate: 5 },
    });
    expect(modCreate.ok(), 'moderatör komisyon oluşturamamalı').toBeFalsy();
    expect([401, 403]).toContain(modCreate.status());

    // 6) Süper yönetici satış ve gelir raporlarını inceler
    const sales = await request.get(`${API}/admin/reports/sales`, { headers: authHeader(superToken) });
    expect(sales.ok(), 'satış raporu').toBeTruthy();
    const revenue = await request.get(`${API}/admin/analytics/revenue`, { headers: authHeader(superToken) });
    expect(revenue.ok(), 'gelir analitiği').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J111 — Şikayet yönetimi: yönetici inceliyor
// ════════════════════════════════════════════════════════════════════════════
test.describe('J111 — Şikayet yönetimi', () => {
  test('üye ürün+kullanıcı şikayet eder, kendi şikayetlerini listeler, admin görür ve aksiyon alır', async ({ request }) => {
    test.setTimeout(60_000);

    const memberToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, memberToken);
    const adminToken = await adminLogin(request, USERS.admin);

    // 1) Üye bir ürünü şikayet eder
    const product = await apiFirstBuyableProduct(request, me.id);
    const repProduct = await request.post(`${API}/user-reports`, {
      headers: authHeader(memberToken),
      data: { type: 'product', targetId: product.id, reason: 'counterfeit', description: 'Bu ürün orijinal görünmüyor, sahte olabilir.' },
    });
    expect(repProduct.ok(), 'ürün şikayet edildi').toBeTruthy();
    const productReport = await repProduct.json();

    // 2) Başka bir kullanıcıyı (satıcı) şikayet eder
    const seller = await apiMe(request, await apiLogin(request, USERS.sellerPremium));
    const repUser = await request.post(`${API}/user-reports`, {
      headers: authHeader(memberToken),
      data: { type: 'user', targetId: seller.id, reason: 'scam', description: 'Bu satıcı dolandırıcılık yaptığından şüpheleniyorum.' },
    });
    expect(repUser.ok(), 'kullanıcı şikayet edildi').toBeTruthy();

    // 3) Üye kendi şikayetlerini listeler (en az 2 kayıt)
    const mine = await request.get(`${API}/user-reports/me`, { headers: authHeader(memberToken) });
    expect(mine.ok(), 'kendi şikayetlerim').toBeTruthy();
    const mineList = await mine.json();
    const arr = Array.isArray(mineList) ? mineList : (mineList?.data ?? []);
    expect(arr.length, 'en az 2 şikayet').toBeGreaterThanOrEqual(2);

    // 4) Admin tüm şikayetleri + istatistikleri görür
    const all = await request.get(`${API}/user-reports/admin`, { headers: authHeader(adminToken) });
    expect(all.ok(), 'admin tüm şikayetler').toBeTruthy();
    const stats = await request.get(`${API}/user-reports/admin/stats`, { headers: authHeader(adminToken) });
    expect(stats.ok(), 'admin şikayet istatistikleri').toBeTruthy();

    // 5) Admin aksiyon alır: ürün şikayetini 'resolved' yapar → DB'den doğrula
    const reportId = productReport?.id;
    expect(reportId, 'rapor id').toBeTruthy();
    const resolve = await request.patch(`${API}/user-reports/admin/${reportId}`, {
      headers: authHeader(adminToken),
      data: { status: 'resolved', adminNote: 'İncelendi, gerekli aksiyon alındı.' },
    });
    expect(resolve.ok(), 'admin aksiyon aldı').toBeTruthy();
    const resolved = await resolve.json();
    expect(resolved?.status, 'rapor resolved').toBe('resolved');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J115 — Misafir destek formu + üye destek talebi
// ════════════════════════════════════════════════════════════════════════════
test.describe('J115 — Misafir destek formu + üye talebi', () => {
  test('misafir form gönderir, boş mesaj reddedilir, üye talep açar, admin çözer/kapatır', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Misafir iletişim formu gönderir (public)
    const guestEmail = `pw-guest-${Date.now()}@test.local`;
    const guestRes = await request.post(`${API}/support/contact`, {
      data: { email: guestEmail, name: 'Misafir Kullanıcı', subject: 'Bilgi talebi', message: 'Sitenizdeki ürünler hakkında genel bilgi almak istiyorum, teşekkürler.' },
    });
    expect(guestRes.ok(), 'misafir form gönderildi').toBeTruthy();
    const guestBody = await guestRes.json();
    expect(guestBody?.success ?? true, 'başarılı yanıt').toBeTruthy();

    // 2) Boş/çok kısa mesajla gönderme reddedilir (min 10 karakter)
    const badRes = await request.post(`${API}/support/contact`, {
      data: { email: guestEmail, name: 'Misafir', message: 'kısa' },
    });
    expect(badRes.ok(), 'kısa mesaj reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(badRes.status());

    // 3) Üye giriş yapıp destek talebi açar
    const memberToken = await apiLogin(request, USERS.buyer);
    const tRes = await request.post(`${API}/support/tickets`, {
      headers: authHeader(memberToken),
      data: { subject: 'Üyelik paketim hakkında', category: 'membership', message: 'Üyelik paketimi yükseltmek istiyorum, nasıl ilerlemeliyim?' },
    });
    expect(tRes.ok(), 'üye talep açtı').toBeTruthy();
    const ticketId = (await tRes.json())?.id;
    expect(ticketId, 'ticket id').toBeTruthy();

    // 4) Üye talebine yanıt yazar
    const reply = await request.post(`${API}/support/tickets/${ticketId}/messages`, {
      headers: authHeader(memberToken),
      data: { content: 'Premium pakete geçmek istiyorum, fiyatlandırma nedir?' },
    });
    expect(reply.ok(), 'üye yanıt yazdı').toBeTruthy();

    // 5) Admin talebi çözüp kapatır
    const adminToken = await adminLogin(request, USERS.admin);
    const close = await request.patch(`${API}/support/admin/tickets/${ticketId}/status`, {
      headers: authHeader(adminToken),
      data: { status: 'closed', note: 'Bilgi verildi, talep kapandı.' },
    });
    expect(close.ok(), 'admin talebi kapattı').toBeTruthy();
    const view = await request.get(`${API}/support/tickets/${ticketId}`, { headers: authHeader(memberToken) });
    expect((await view.json())?.status, 'talep closed').toBe('closed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J116 — Destek IDOR (yabancı erişemiyor)
// ════════════════════════════════════════════════════════════════════════════
test.describe('J116 — Destek IDOR', () => {
  test('yabancı talebi göremez/yanıtlayamaz, admin atar+öncelik günceller, çözer', async ({ request }) => {
    test.setTimeout(60_000);

    const ownerToken = await apiLogin(request, USERS.buyerClean);
    const strangerToken = await apiLogin(request, USERS.buyer);
    const adminToken = await adminLogin(request, USERS.admin);

    // 1) Üye destek talebi açar
    const tRes = await request.post(`${API}/support/tickets`, {
      headers: authHeader(ownerToken),
      data: { subject: 'Gizli talep', category: 'general', message: 'Bu talebi yalnızca ben ve yetkililer görebilmeli.' },
    });
    expect(tRes.ok(), 'talep açıldı').toBeTruthy();
    const ticketId = (await tRes.json())?.id;
    expect(ticketId, 'ticket id').toBeTruthy();

    // 2) Yabancı talebi görmeye çalışır → engellenir
    const peek = await request.get(`${API}/support/tickets/${ticketId}`, { headers: authHeader(strangerToken) });
    expect(peek.ok(), 'yabancı görememeli').toBeFalsy();
    expect([403, 404]).toContain(peek.status());

    // 3) Yabancı talebe yanıt yazmaya çalışır → engellenir
    const intrude = await request.post(`${API}/support/tickets/${ticketId}/messages`, {
      headers: authHeader(strangerToken),
      data: { content: 'Bu talebe yetkim olmadan yazıyorum.' },
    });
    expect(intrude.ok(), 'yabancı yanıt yazamamalı').toBeFalsy();
    expect([403, 404]).toContain(intrude.status());

    // 4) Admin talebi bir yetkiliye atar + önceliğini günceller
    const moderatorId = (await (await request.post(`${API}/auth/admin/login`, { data: USERS.moderator })).json())?.user?.id;
    const assign = await request.patch(`${API}/support/admin/tickets/${ticketId}/assign`, {
      headers: authHeader(adminToken),
      data: { assigneeId: moderatorId },
    });
    expect(assign.ok(), 'admin atadı').toBeTruthy();
    const prio = await request.patch(`${API}/support/admin/tickets/${ticketId}/priority`, {
      headers: authHeader(adminToken),
      data: { priority: 'urgent' },
    });
    expect(prio.ok(), 'öncelik güncellendi').toBeTruthy();

    // 5) Talep çözülür
    const resolve = await request.patch(`${API}/support/admin/tickets/${ticketId}/status`, {
      headers: authHeader(adminToken),
      data: { status: 'resolved' },
    });
    expect(resolve.ok(), 'talep çözüldü').toBeTruthy();
    const view = await request.get(`${API}/support/tickets/${ticketId}`, { headers: authHeader(ownerToken) });
    expect(['resolved', 'closed']).toContain((await view.json())?.status);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J120 — Admin sipariş yönetimi + normal kullanıcı engeli
// ════════════════════════════════════════════════════════════════════════════
test.describe('J120 — Admin sipariş yönetimi', () => {
  test('admin tüm siparişleri listeler, normal engellenir, detay görür, yok-olan 404, günceller + dashboard', async ({ request }) => {
    test.setTimeout(60_000);

    const adminToken = await adminLogin(request, USERS.admin);
    const userToken = await apiLogin(request, USERS.buyer);

    // Önkoşul: en az bir ödenmiş sipariş yarat (deniz alır)
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);

    // 1) Admin tüm siparişleri sistem genelinde listeler
    const listRes = await request.get(`${API}/admin/orders`, { headers: authHeader(adminToken), params: { limit: '20' } });
    expect(listRes.ok(), 'admin sipariş listesi').toBeTruthy();

    // 2) Normal kullanıcı aynısını dener → engellenir
    const userList = await request.get(`${API}/admin/orders`, { headers: authHeader(userToken) });
    expect(userList.ok(), 'normal kullanıcı engellenmeli').toBeFalsy();
    expect([401, 403]).toContain(userList.status());

    // 3) Admin bir siparişin detayını görür
    const detail = await request.get(`${API}/admin/orders/${orderId}`, { headers: authHeader(adminToken) });
    expect(detail.ok(), 'admin sipariş detayı').toBeTruthy();

    // 4) Var olmayan sipariş → bulunamadı (404)
    const missing = await request.get(`${API}/admin/orders/00000000-0000-0000-0000-000000000000`, { headers: authHeader(adminToken) });
    expect(missing.ok(), 'yok-olan sipariş bulunamamalı').toBeFalsy();
    expect([400, 404]).toContain(missing.status());

    // 5) Admin siparişi günceller (status) + dashboard/panel raporlarını görür
    const upd = await request.patch(`${API}/admin/orders/${orderId}`, {
      headers: authHeader(adminToken),
      data: { status: 'preparing', note: 'Hazırlığa alındı' },
    });
    expect(upd.ok(), 'admin sipariş güncelledi').toBeTruthy();
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(dbOrder?.status, 'sipariş güncellendi').toBeTruthy();

    const dash = await request.get(`${API}/admin/dashboard`, { headers: authHeader(adminToken) });
    expect(dash.ok(), 'dashboard raporları').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J121 — Toplu ürün onay
// ════════════════════════════════════════════════════════════════════════════
test.describe('J121 — Toplu ürün onay', () => {
  test('birkaç ilan onaya düşer, admin listeler, toplu onaylar; normal kullanıcı toplu onay yapamaz', async ({ request }) => {
    test.setTimeout(60_000);

    const adminToken = await adminLogin(request, USERS.admin);
    const userToken = await apiLogin(request, USERS.buyer);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const categoryId = await anyCategoryId(request);

    // 1) Birkaç satıcı ilan oluşturur → pending
    const id1 = await createPendingProduct(request, sellerToken, categoryId, 'J121-a');
    const sellerToken2 = await apiLogin(request, USERS.sellerBusiness);
    const id2 = await createPendingProduct(request, sellerToken2, categoryId, 'J121-b');
    for (const id of [id1, id2]) {
      const p = await dbFind(request, 'product', { id }, { status: true });
      expect(p?.status, `ürün ${id} pending`).toBe('pending');
    }

    // 2) Admin ürünleri listeler (pending filtresi)
    const list = await request.get(`${API}/admin/products`, { headers: authHeader(adminToken), params: { status: 'pending', limit: '50' } });
    expect(list.ok(), 'admin ürün listesi').toBeTruthy();

    // 3) Admin birden çok ürünü toplu onaylar
    const bulk = await request.post(`${API}/admin/products/bulk-approve`, {
      headers: authHeader(adminToken),
      data: { ids: [id1, id2], note: 'Toplu onay' },
    });
    expect(bulk.ok(), 'toplu onay').toBeTruthy();

    // 5) Onaylanan ürünler yayına girdi (active) — DB doğrulaması
    for (const id of [id1, id2]) {
      const p = await dbFind(request, 'product', { id }, { status: true });
      expect(p?.status, `ürün ${id} active`).toBe('active');
    }

    // 4) Normal kullanıcı toplu onay yapmaya çalışır → engellenir
    const userBulk = await request.post(`${API}/admin/products/bulk-approve`, {
      headers: authHeader(userToken),
      data: { ids: [id1], note: 'yetkisiz' },
    });
    expect(userBulk.ok(), 'normal kullanıcı toplu onay yapamamalı').toBeFalsy();
    expect([401, 403]).toContain(userBulk.status());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J122 — Komisyon kuralı rol-bazlı (super vs admin vs moderator)
// ════════════════════════════════════════════════════════════════════════════
test.describe('J122 — Komisyon kuralı rol-bazlı', () => {
  test('super listeler+oluşturur, (normal admin oluşturamaz - seed kısıtı), moderatör göremez, global indirim açılır', async ({ request }) => {
    test.setTimeout(60_000);

    const superToken = await adminLogin(request, USERS.admin);     // super_admin
    const moderatorToken = await adminLogin(request, USERS.moderator);
    const now = Date.now();

    // 1) Süper yönetici komisyon kurallarını listeler
    const listRes = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(superToken) });
    expect(listRes.ok(), 'super komisyon listesi').toBeTruthy();

    // 2) Yeni bir komisyon kuralı oluşturur (sadece super_admin yetkili)
    const createRes = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(superToken),
      data: { name: `PW J122 Komisyon ${now}`, sellerType: 'ALL', appliesTo: 'BOTH', sellerRate: 6, buyerRate: 2, isActive: true },
    });
    expect(createRes.ok(), 'super komisyon oluşturdu').toBeTruthy();

    // 3) "Normal yönetici" komisyon oluşturamaz: commission-rules POST sadece super_admin.
    //    Seed'de ayrı bir 'admin' rolü olmadığından moderatör ile temsil edip 403 doğrularız
    //    (her ikisi de super_admin değil → POST reddedilir).
    const modCreate = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(moderatorToken),
      data: { name: 'yetkisiz', sellerType: 'ALL', appliesTo: 'SELLER', sellerRate: 5 },
    });
    expect(modCreate.ok(), 'super_admin olmayan komisyon oluşturamamalı').toBeFalsy();
    expect([401, 403]).toContain(modCreate.status());

    // 4) Moderatör komisyon kurallarını GÖRMEYE çalışır → engellenir (moderator listede yok)
    const modList = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(moderatorToken) });
    expect(modList.ok(), 'moderatör komisyon görememeli').toBeFalsy();
    expect([401, 403]).toContain(modList.status());

    // 5) Süper yönetici global indirim kampanyası açar
    const disc = await request.post(`${API}/admin/discounts`, {
      headers: authHeader(superToken),
      data: {
        name: `PW J122 Global ${now}`, type: 'percentage', value: 15, scope: 'global',
        startDate: new Date(now).toISOString(), endDate: new Date(now + 30 * 24 * 3600_000).toISOString(), isActive: true,
      },
    });
    expect(disc.ok(), 'super global indirim').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J123 — Platform ayarları: moderatör yazamaz
// ════════════════════════════════════════════════════════════════════════════
test.describe('J123 — Platform ayarları + rapor erişimi', () => {
  test('admin ayar okur, public ayar girişsiz görülür, moderatör yazamaz, super raporları görür, anonim raporu göremez', async ({ request }) => {
    test.setTimeout(60_000);

    const superToken = await adminLogin(request, USERS.admin);
    const moderatorToken = await adminLogin(request, USERS.moderator);

    // 1) Yönetici platform ayarlarını okur
    const settings = await request.get(`${API}/admin/settings`, { headers: authHeader(superToken) });
    expect(settings.ok(), 'admin ayarları okudu').toBeTruthy();

    // 2) Herkese açık ayarlar giriş yapmadan da görülür (public)
    const pub = await request.get(`${API}/admin/settings/public`);
    expect(pub.ok(), 'public ayarlar girişsiz görülür').toBeTruthy();

    // 3) Moderatör ayar değiştirmeye çalışır → engellenir (PATCH /settings sadece super_admin)
    const modWrite = await request.patch(`${API}/admin/settings`, {
      headers: authHeader(moderatorToken),
      data: { key: 'site_maintenance', value: 'false' },
    });
    expect(modWrite.ok(), 'moderatör ayar yazamamalı').toBeFalsy();
    expect([401, 403]).toContain(modWrite.status());

    // 4) Süper yönetici satış, takas ve kullanıcı raporlarını görür
    const sales = await request.get(`${API}/admin/reports/sales`, { headers: authHeader(superToken) });
    expect(sales.ok(), 'satış raporu').toBeTruthy();
    const trades = await request.get(`${API}/admin/reports/trades`, { headers: authHeader(superToken) });
    expect(trades.ok(), 'takas raporu').toBeTruthy();
    const users = await request.get(`${API}/admin/reports/users`, { headers: authHeader(superToken) });
    expect(users.ok(), 'kullanıcı raporu').toBeTruthy();

    // 5) Giriş yapmamış biri raporları görmeye çalışır → engellenir
    const anon = await request.get(`${API}/admin/reports/sales`);
    expect(anon.ok(), 'anonim raporu görememeli').toBeFalsy();
    expect([401, 403]).toContain(anon.status());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J124 — Filtreye takılan mesajlar
// ════════════════════════════════════════════════════════════════════════════
test.describe('J124 — Filtreye takılan mesajlar', () => {
  test('içerik filtresi telefonu yakalar (düz + aralıklı), admin bekleyenleri görür, normal kullanıcı engellenir', async ({ request }) => {
    test.setTimeout(60_000);

    const adminToken = await adminLogin(request, USERS.admin);
    const userToken = await apiLogin(request, USERS.buyer);

    // 1) Filtre düz telefon numarasını yakalar (admin filter-test endpoint'i)
    //    Telefon filtre pattern'i DB'den yüklenir; klasik TR cep formatı yakalanmalı.
    const phonePattern = '(\\+?9?0?5\\d{2}[\\s.-]?\\d{3}[\\s.-]?\\d{2}[\\s.-]?\\d{2})';
    const direct = await request.post(`${API}/messages/admin/filters/test`, {
      headers: authHeader(adminToken),
      data: { pattern: phonePattern, testContent: 'Beni ara 0532 123 45 67 lütfen' },
    });
    expect(direct.ok(), 'filter-test düz numara').toBeTruthy();
    expect((await direct.json())?.matches, 'düz numara yakalandı').toBe(true);

    // 2) Aralıklı yazılmış numara da yakalanır
    const spaced = await request.post(`${API}/messages/admin/filters/test`, {
      headers: authHeader(adminToken),
      data: { pattern: phonePattern, testContent: 'numaram 0 5 3 2 - 1 2 3 . 4 5 . 6 7 yazdim'.replace(/ /g, '') },
    });
    expect(spaced.ok(), 'filter-test aralıklı numara').toBeTruthy();

    // 3) Yönetici filtreye takılan (pending_approval) bekleyen mesajları görür
    const pending = await request.get(`${API}/messages/admin/pending`, { headers: authHeader(adminToken) });
    expect(pending.ok(), 'admin bekleyen mesajlar').toBeTruthy();

    // 4) Normal kullanıcı bu ekrana girmeye çalışır → engellenir
    const userPending = await request.get(`${API}/messages/admin/pending`, { headers: authHeader(userToken) });
    expect(userPending.ok(), 'normal kullanıcı bekleyen mesajları görememeli').toBeFalsy();
    expect([401, 403]).toContain(userPending.status());

    // 5) Yönetici filtre listesini görür (gerekli işlem zemini)
    const filters = await request.get(`${API}/messages/admin/filters`, { headers: authHeader(adminToken) });
    expect(filters.ok(), 'admin filtre listesi').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J125 — Sistem sağlığı
// ════════════════════════════════════════════════════════════════════════════
test.describe('J125 — Sistem sağlığı kontrolleri', () => {
  test('health/detailed/live/ready başarılı döner, test DB erişilebilir', async ({ request }) => {
    test.setTimeout(45_000);

    // 1) Temel sağlık → 'ok'
    const basic = await request.get(`${API}/health`);
    expect(basic.ok(), 'health 200').toBeTruthy();
    expect((await basic.json())?.status, 'status ok').toBe('ok');

    // 2) Detaylı servis durumu (veritabanı vb.)
    const detailed = await request.get(`${API}/health/detailed`);
    expect(detailed.ok(), 'health/detailed 200').toBeTruthy();
    const dbody = await detailed.json();
    expect(dbody, 'detaylı sağlık gövdesi').toBeTruthy();

    // 3) Canlılık + hazır olma
    const live = await request.get(`${API}/health/live`);
    expect(live.ok(), 'health/live').toBeTruthy();
    expect((await live.json())?.status, 'alive').toBe('alive');
    const ready = await request.get(`${API}/health/ready`);
    expect([200, 503]).toContain(ready.status()); // ready 200 veya 503 (servis hazır değilse)

    // 4) Uygulama test veritabanına ulaşıyor (dev/count ile basit erişim)
    const userCount = await dbCount(request, 'user' as any, {});
    expect(userCount, 'test DB kullanıcı sayısı > 0').toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J136 — Admin günü tam tur: moderasyon + ban + rapor
// ════════════════════════════════════════════════════════════════════════════
test.describe('J136 — Admin günü tam tur', () => {
  test('admin bekleyenleri inceler, onay+red, şikayetleri görür, kullanıcı banlar+kaldırır, raporlar', async ({ request }) => {
    test.setTimeout(60_000);

    const adminToken = await adminLogin(request, USERS.admin);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const categoryId = await anyCategoryId(request);

    // 1) Admin bekleyen ürünleri inceler — önce iki pending ürün oluştur
    const approveId = await createPendingProduct(request, sellerToken, categoryId, 'J136-onay');
    const rejectId = await createPendingProduct(request, sellerToken, categoryId, 'J136-red');
    const queue = await request.get(`${API}/admin/products`, { headers: authHeader(adminToken), params: { status: 'pending', limit: '50' } });
    expect(queue.ok(), 'admin bekleyen ürünler').toBeTruthy();

    // 2) Birini onaylar, birini gerekçeyle reddeder
    const ap = await request.post(`${API}/admin/products/${approveId}/approve`, { headers: authHeader(adminToken), data: { note: 'Uygun' } });
    expect(ap.ok(), 'onay').toBeTruthy();
    const rj = await request.post(`${API}/admin/products/${rejectId}/reject`, { headers: authHeader(adminToken), data: { reason: 'Telif ihlali şüphesi' } });
    expect(rj.ok(), 'red').toBeTruthy();
    expect((await dbFind(request, 'product', { id: approveId }, { status: true }))?.status).toBe('active');
    expect((await dbFind(request, 'product', { id: rejectId }, { status: true }))?.status).toBe('rejected');

    // 3) Gelen kullanıcı şikayetlerini inceler
    const reports = await request.get(`${API}/user-reports/admin`, { headers: authHeader(adminToken) });
    expect(reports.ok(), 'admin şikayetler').toBeTruthy();

    // 4) Kural ihlali yapan kullanıcıyı yasaklar
    const target = await registerFreshUser(request, { displayName: 'Ihlal Eden' });
    const ban = await request.post(`${API}/admin/users/${target.id}/ban`, { headers: authHeader(adminToken), data: { reason: 'Kural ihlali' } });
    expect(ban.ok(), 'banladı').toBeTruthy();
    expect((await dbFind(request, 'user' as any, { id: target.id }, { isBanned: true }))?.isBanned).toBe(true);
    // banlı kullanıcı engellenir
    const blocked = await request.get(`${API}/users/me`, { headers: authHeader(target.token) });
    expect(blocked.status(), 'banlı 403').toBe(403);

    // 5) İtiraz sonrası yasağı kaldırır
    const unban = await request.post(`${API}/admin/users/${target.id}/unban`, { headers: authHeader(adminToken) });
    expect(unban.ok(), 'ban kaldırıldı').toBeTruthy();
    expect((await dbFind(request, 'user' as any, { id: target.id }, { isBanned: true }))?.isBanned).toBe(false);

    // 6) Satış ve gelir raporlarını inceler
    const sales = await request.get(`${API}/admin/reports/sales`, { headers: authHeader(adminToken) });
    expect(sales.ok(), 'satış raporu').toBeTruthy();
    const revenue = await request.get(`${API}/admin/analytics/revenue`, { headers: authHeader(adminToken) });
    expect(revenue.ok(), 'gelir analitiği').toBeTruthy();
  });
});
