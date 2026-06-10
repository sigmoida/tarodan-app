/**
 * J55 — Satıcı ürün başlığını çok kısa giriyor
 * Kaynak: suite-b-catalog.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE B — Katalog & Arama: J52, J53, J54, J55, J56, J57, J77.
 * Gerçek backend + tarodan_test + (J77) gerçek kargo shipment + dev backdate.
 *
 * Endpoint yolları controller'lardan doğrulandı:
 *  - categories: GET /categories, GET /categories/slug/:slug (404 NotFound)  [category.controller.ts]
 *  - brands:     GET /brands, GET /brands/:slug (404 NotFound)               [brand.controller.ts]
 *  - search:     GET /search/products?q=&minPrice=&maxPrice=, GET /search/autocomplete?q= [search.controller.ts]
 *  - products:   GET /products/:id, POST /products/:id/view {viewCount}, POST/DELETE like, [product.controller.ts]
 *                POST /products (create, MinLength(5) title + Min(1) price), PATCH/DELETE /products/:id (owner)
 *  - tax:        GET /tax/calculate?countryCode=&subtotal=  {rate,taxAmount}  [tax.controller.ts]
 *  - quote:      POST /orders/quote {items:[{productId,quantity}]} → {itemsSubtotal,shippingAmount,totalAmount} [order.controller.ts]
 *  - wishlist:   GET/POST /wishlist {productId}, DELETE /wishlist/:productId  [wishlist.controller.ts]
 *  - shipping:   GET /shipping/carriers, GET /shipping/rates?city=&carrier= {rate}, POST /shipping {orderId,provider} [shipping.controller.ts]
 *  - order flow: POST /orders/:id/prepare (paid→preparing), POST /shipping (preparing→shipped, tracking üretir),
 *                POST /orders/:id/confirm (delivered→completed).  [order.controller.ts + shipping.service.ts]
 */
import { test, expect } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
} from '../support/helpers';
import { backdate, dbFind } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// ─────────────────────────────────────────────────────────────────────────────
// J52 — Katalog gezinme: olmayan kategori ve marka 404
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J55 — İlan başlık ve fiyat validation', () => {
  test('kısa/boş başlık ve fiyat<1 reddedilir, geçerli ilan yayına girer', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    // Geçerli categoryId'yi canlı bir üründen al (UUID tahmin etme)
    const sample = await apiFirstBuyableProduct(request);
    const sampleDetail = await request.get(`${API}/products/${sample.id}`);
    const categoryId: string =
      (await sampleDetail.json())?.categoryId ?? (await sampleDetail.json())?.category?.id;
    expect(categoryId, 'geçerli categoryId').toBeTruthy();

    const base = { categoryId, condition: 'very_good', price: 150 };

    // 2) Başlık 5 karakterden kısa → reddedilir (MinLength(5))
    const shortTitle = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: 'abc' },
    });
    expect(shortTitle.ok(), 'kısa başlık reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(shortTitle.status());

    // 3) Başlık boş → reddedilir
    const emptyTitle = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: '' },
    });
    expect(emptyTitle.ok(), 'boş başlık reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(emptyTitle.status());

    // 4) Fiyat 1'den küçük → reddedilir (Min(1))
    const lowPrice = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: 'Geçerli Başlık Test', price: 0 },
    });
    expect(lowPrice.ok(), 'fiyat<1 reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(lowPrice.status());

    // 5) Geçerli bilgilerle ilan oluşturulur → yayına girer (DB'de product oluştu)
    const title = `PW Geçerli İlan ${Date.now()}`;
    const okRes = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title, price: 199 },
    });
    expect(okRes.ok(), 'geçerli ilan oluşturuldu').toBeTruthy();
    const created = await okRes.json();
    const newId = created?.id ?? created?.product?.id;
    expect(newId, 'oluşan ürün id').toBeTruthy();
    const dbProduct = await dbFind(request, 'product', { id: newId }, { id: true, title: true, status: true });
    expect(dbProduct?.title).toBe(title);

    // Temizlik: oluşturulan test ilanını sil (seed kirliliğini önle)
    await request.delete(`${API}/products/${newId}`, { headers: auth(sellerToken) }).catch(() => {});
  });
});
