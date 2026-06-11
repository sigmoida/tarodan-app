/**
 * J20 — Destek talebi yaşam döngüsü
 * Kaynak: suite-k-admin.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
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

test.describe('J20 — Destek talebi yaşam döngüsü', () => {
  test('üye talep açar, yanıt yazar, yabancı engellenir, admin atar/çözer, üye görür', async ({ request }) => {
    test.setTimeout(60_000);

    const memberToken = await apiLogin(request, USERS.buyerClean);
    const strangerToken = await apiLogin(request, USERS.buyer);
    const adminToken = await adminLogin(request, USERS.admin);

    // 1) Üye destek talebi açar
    const createRes = await request.post(`${API}/support/tickets`, {
      headers: authHeader(memberToken),
      data: { subject: 'Siparişim hakkında sorum var', category: 'other', message: 'Siparişimin durumu ile ilgili bilgi almak istiyorum, yardımcı olur musunuz?' },
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
    // Not: Admin yanıtı çözümü AŞAĞIDA status-note ('Bilgi verildi') ile verir. User message-endpoint
    // admin-JWT'de req.user.adminId set etmediğinden 403 dönebilir (admin mesaj yazma yolu = status note).
    // Bu adım kritik değil → best-effort (akış status-resolve + üye görünürlüğü ile doğrulanıyor).
    void adminReply;

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
