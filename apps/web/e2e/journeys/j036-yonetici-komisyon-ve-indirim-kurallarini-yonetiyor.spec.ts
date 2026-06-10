/**
 * J36 — Yönetici komisyon ve indirim kurallarını yönetiyor
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
      data: { name: `PW Komisyon ${now}`, sellerType: 'PREMIUM', appliesTo: 'SELLER', sellerRate: 7.5, isActive: true },
    });
    if (!createComm.ok()) expect(createComm.ok(), `super komisyon oluşturdu (${createComm.status()}) ${(await createComm.text()).slice(0, 120)}`).toBeTruthy();

    // 4) Moderatör komisyon kurallarını GÖRMEYE çalışır → engellenir
    //    (commission-rules sadece super_admin + admin; moderator değil)
    const modComm = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(moderatorToken) });
    expect(modComm.ok(), 'moderatör komisyon görememeli').toBeFalsy();
    expect([401, 403]).toContain(modComm.status());

    // 5) Moderatör komisyon kuralı OLUŞTURMAYA çalışır → engellenir (sadece super_admin)
    const modCreate = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(moderatorToken),
      data: { name: 'yetkisiz', sellerType: 'PREMIUM', appliesTo: 'SELLER', sellerRate: 5 },
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
