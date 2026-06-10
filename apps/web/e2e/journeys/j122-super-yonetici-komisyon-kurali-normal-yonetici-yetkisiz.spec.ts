/**
 * J122 — Süper yönetici komisyon kuralı, normal yönetici yetkisiz
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

test.describe('J122 — Komisyon kuralı rol-bazlı', () => {
  test('super listeler+oluşturur, (normal admin oluşturamaz - seed kısıtı), moderatör göremez, global indirim açılır', async ({ request }) => {
    test.setTimeout(60_000);

    const superToken = await adminLogin(request, USERS.admin);     // super_admin
    const moderatorToken = await adminLogin(request, USERS.moderator);
    const now = Date.now();

    // 1) Süper yönetici komisyon kurallarını listeler
    const listRes = await request.get(`${API}/admin/commission-rules`, { headers: authHeader(superToken) });
    expect(listRes.ok(), 'super komisyon listesi').toBeTruthy();

    // 2) Yeni bir komisyon kuralı oluşturur (sadece super_admin yetkili).
    //    Kategori-spesifik kural → seed'in (tüm-kategori) ALL/BUSINESS/FREE kurallarıyla çakışmaz.
    const _cat = await anyCategoryId(request);
    const createRes = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(superToken),
      data: { name: `PW J122 Komisyon ${now}`, categoryId: _cat, sellerType: 'BUSINESS', appliesTo: 'BOTH', sellerRate: 6, buyerRate: 2, isActive: true },
    });
    expect(createRes.ok(), 'super komisyon oluşturdu').toBeTruthy();

    // 3) "Normal yönetici" komisyon oluşturamaz: commission-rules POST sadece super_admin.
    //    Seed'de ayrı bir 'admin' rolü olmadığından moderatör ile temsil edip 403 doğrularız
    //    (her ikisi de super_admin değil → POST reddedilir).
    const modCreate = await request.post(`${API}/admin/commission-rules`, {
      headers: authHeader(moderatorToken),
      data: { name: 'yetkisiz', sellerType: 'PREMIUM', appliesTo: 'SELLER', sellerRate: 5 },
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
