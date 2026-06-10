/**
 * J111 — Şikayet yönetimi: yönetici inceliyor
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
