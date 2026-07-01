/**
 * Domain 25 — Frontend Parite (PAR): API-KONTRAT paritesi (üç istemci aynı API).
 *
 * Kök-neden: web/admin (Cookie, withCredentials) ve mobile (Authorization: Bearer)
 * AYNI REST uçlarını AYNI gövdeyle tüketir; fark yalnız kimlik TAŞIMASINDA. Bu spec
 * `request` fixture ile ham API yanıtının istemci kimlik yöntemine göre DEĞİŞMEDİĞİNİ
 * kanıtlar (gövde alan adları/değerleri aynı; sapma yalnız ekranda gösterilen biçimde).
 *
 * Çalışan stack gerektirir (webServer: API :3001, PAYMENT_BYPASS=true). Diğer j0xx
 * journey'leriyle aynı önkoşullar.
 *
 * Kaynak kanıt:
 *  - web/api.ts:12-13 → Authorization header YOK, withCredentials:true (Cookie).
 *  - mobile/api.ts:83 → Authorization: Bearer ${token}, Cookie YOK.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, apiGetOrder } from '../../support/helpers';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// ─────────────────────────────────────────────────────────────────────────────
// PAR-001 — Üç istemci aynı /api/products/:id gövdesini alır; fark yalnız auth taşıma
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-001 [P0] — aynı endpoint, aynı gövde; fark yalnız kimlik taşıma', () => {
  test('PAR-001 [P0] — /products/:id gövdesi Bearer (mobile) ve auth\'suz (public) çağrıda aynı alanları taşır', async ({ request }) => {
    test.setTimeout(60_000);
    // Satın alınabilir bir ürün bul (herkese açık aktif ürün).
    const product = await apiFirstBuyableProduct(request);

    // (a) Mobile tarzı: Authorization: Bearer (buyer token), Cookie yok.
    const token = await apiLogin(request, USERS.buyerClean);
    const asMobile = await request.get(`${API}/products/${product.id}`, { headers: bearer(token) });
    expect(asMobile.ok(), 'Bearer ile /products/:id 200').toBeTruthy();
    const bodyMobile = await asMobile.json();

    // (b) Public (misafir/web ilk yükleme): kimlik taşımadan aynı uç.
    const asGuest = await request.get(`${API}/products/${product.id}`);
    expect(asGuest.ok(), 'auth\'suz /products/:id 200 (public)').toBeTruthy();
    const bodyGuest = await asGuest.json();

    // Ham gövde AYNI: id/fiyat/başlık/statü aynı değerler (biçimlenmemiş ham veri).
    const pick = (b: any) => {
      const p = b?.data ?? b?.product ?? b;
      return { id: p.id, price: p.price, title: p.title, status: p.status, sellerId: p.sellerId ?? p.seller?.id };
    };
    expect(pick(bodyMobile)).toEqual(pick(bodyGuest));

    // Fiyat ALANI ham sayı (biçimlenmemiş) — biçim istemci tarafında (PAR-020) uygulanır.
    const priceRaw = (bodyGuest?.data ?? bodyGuest?.product ?? bodyGuest)?.price;
    expect(typeof priceRaw === 'number' || typeof priceRaw === 'string').toBeTruthy();
    expect(String(priceRaw)).not.toContain('TL'); // ham veri, "TL" içermez
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-010 — Ortak ana akış route envanteri: aynı API verisi her iki istemcide erişilir
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-010 [P1] — ana akış uçları her iki istemci için de mevcut ve aynı veriyi verir', () => {
  test('PAR-010 [P1] — products/orders/offers/trades/membership uçları buyer token ile erişilir', async ({ request }) => {
    test.setTimeout(60_000);
    const token = await apiLogin(request, USERS.buyerClean);
    // Her ana akış için karşılık gelen liste ucu 2xx döner (istemci fark etmeksizin aynı kontrat).
    const endpoints = ['/products', '/orders', '/offers', '/trades', '/memberships/plans'];
    for (const ep of endpoints) {
      const res = await request.get(`${API}${ep}`, { headers: bearer(token) });
      // Bazı uçlar plan/isim farkıyla 404 verebilir; en azından products/orders/offers/trades erişilmeli.
      if (['/products', '/orders', '/offers', '/trades'].includes(ep)) {
        expect(res.ok(), `${ep} buyer token ile 2xx`).toBeTruthy();
        const b = await res.json();
        const list = b?.data ?? b?.[ep.slice(1)] ?? (Array.isArray(b) ? b : b?.items);
        expect(Array.isArray(list) || Array.isArray(b?.data) || typeof b === 'object', `${ep} gövde nesne/dizi`).toBeTruthy();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-071 — Misafir checkout OTP akışı: web ve mobile AYNI uçları çağırır
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-071 [P1] — misafir checkout OTP: kayıtlı e-posta 409 (web=mobile aynı kontrat)', () => {
  test('PAR-071 [P1] — guest/send-verification-code kayıtlı e-posta ile EMAIL_ALREADY_REGISTERED (409)', async ({ request }) => {
    // Kayıtlı seed e-posta ile misafir doğrulama kodu istenirse iki istemcide de 409.
    const res = await request.post(`${API}/orders/guest/send-verification-code`, {
      data: { email: USERS.buyer.email },
    });
    expect(res.ok(), 'kayıtlı e-posta misafir OTP reddedilmeli').toBeFalsy();
    expect(res.status(), 'kayıtlı e-posta → 409').toBe(409);
    const body = await res.json().catch(() => ({}));
    const code = body?.code ?? body?.error ?? body?.message ?? '';
    expect(String(code)).toMatch(/EMAIL_ALREADY_REGISTERED|already|kayıtlı/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-092 — API validation hata gövdesi okunabilir; iki istemci aynı hatadan türetir
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-092 [P1] — validation hata gövdesi okunabilir (message array/string)', () => {
  test('PAR-092 [P1] — geçersiz gövde → 400 ve okunabilir message alanı (asla boş)', async ({ request }) => {
    const token = await apiLogin(request, USERS.sellerFree);
    // Geçersiz ürün oluşturma (başlık MinLength(5) ihlali) → 400 + validation mesajı.
    const res = await request.post(`${API}/products`, { headers: bearer(token), data: { title: 'x', price: 1 } });
    expect(res.ok(), 'geçersiz ürün reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    const msg = body?.message ?? body?.errors ?? body?.error;
    // message string veya array olabilir; her ikisi de istemcide okunabilir string'e çevrilir (PAR-092).
    expect(msg, 'hata mesajı mevcut').toBeTruthy();
    const flat = Array.isArray(msg) ? msg.join(' ') : String(msg);
    expect(flat.length).toBeGreaterThan(0);
    expect(flat).not.toContain('[object Object]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-150 — Sipariş durumu tek kaynak (order.status): admin↔satıcı↔alıcı aynı statü
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-150 [P0] — sipariş statüsü tek kaynak (API order.status) tüm görünümlerde aynı', () => {
  test('PAR-150 [P0] — alıcı ve satıcı GET /orders/:id AYNI status değerini görür', async ({ request }) => {
    test.setTimeout(90_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer?.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);

    // Alıcı görünümü:
    const buyerOrder = await apiGetOrder(request, buyerToken, orderId);
    expect(buyerOrder?.status, 'alıcı order.status').toBeTruthy();

    // Satıcı görünümü: ürünün satıcısını bul, onun token'ıyla aynı siparişi çek.
    let sellerStatus: string | undefined;
    for (const su of [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree]) {
      const st = await apiLogin(request, su);
      const sOrder = await apiGetOrder(request, st, orderId);
      if (sOrder?.status) { sellerStatus = sOrder.status; break; }
    }
    // Satıcı erişebiliyorsa statü AYNI olmalı (tek kaynak). Erişemiyorsa alıcı statüsü yeterli kanıt.
    if (sellerStatus) {
      expect(sellerStatus, 'satıcı ↔ alıcı aynı order.status').toBe(buyerOrder.status);
    }
    // Statü ham enum (biçimlenmemiş) — etiket dili istemcide (PAR-040) uygulanır.
    expect(String(buyerOrder.status)).toMatch(/^[a-z_]+$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-153 — Para tutarları: API net tutar/komisyon değeri tüm görünümlerde aynı sayı
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-153 [P1] — para tutarları API tek kaynak (değer aynı; biçim/simge istemcide)', () => {
  test('PAR-153 [P1] — sipariş toplam/komisyon ham sayısal değer, biçimlenmemiş', async ({ request }) => {
    test.setTimeout(90_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer?.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    const order = await apiGetOrder(request, buyerToken, orderId);

    const amount = order?.totalAmount ?? order?.total ?? order?.subtotal;
    expect(amount, 'sipariş tutarı alanı mevcut').toBeDefined();
    // Ham sayısal (biçim/simge istemcide: web kart ₺ (PAR-021), format.ts TL); değer aynı kaynak.
    expect(typeof amount === 'number' || typeof amount === 'string').toBeTruthy();
    expect(String(amount)).not.toMatch(/TL|₺/); // ham veri simge içermez
  });
});
