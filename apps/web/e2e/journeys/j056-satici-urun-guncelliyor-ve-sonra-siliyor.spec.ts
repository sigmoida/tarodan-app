/**
 * J56 — Satıcı ürün güncelliyor ve sonra siliyor
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

test.describe('J56 — Ürün güncelle/sil ve IDOR koruması', () => {
  test('sahip günceller, yabancı engellenir, sahip siler', async ({ request }) => {
    test.setTimeout(60_000);

    const ownerToken = await apiLogin(request, USERS.sellerPremium);
    const sample = await apiFirstBuyableProduct(request);
    const detail = await request.get(`${API}/products/${sample.id}`);
    const categoryId: string = (await detail.json())?.categoryId ?? (await detail.json())?.category?.id;
    expect(categoryId).toBeTruthy();

    // Önkoşul: sahip kendi ilanını oluşturur
    const createRes = await request.post(`${API}/products`, {
      headers: auth(ownerToken),
      data: { title: `PW J56 İlan ${Date.now()}`, price: 120, categoryId, condition: 'very_good' },
    });
    expect(createRes.ok(), 'ilan oluştu').toBeTruthy();
    const productId = (await createRes.json())?.id;
    expect(productId).toBeTruthy();

    // 2) Sahip başlık + fiyatı günceller (PATCH /products/:id)
    const newTitle = `PW J56 Güncellendi ${Date.now()}`;
    const update = await request.patch(`${API}/products/${productId}`, {
      headers: auth(ownerToken),
      data: { title: newTitle, price: 175 },
    });
    expect(update.ok(), 'sahip güncelleyebilir').toBeTruthy();
    const dbAfterUpdate = await dbFind(request, 'product', { id: productId }, { title: true, price: true });
    expect(dbAfterUpdate?.title, 'başlık güncellendi').toBe(newTitle);
    expect(Number(dbAfterUpdate?.price), 'fiyat güncellendi').toBe(175);

    // 3) IDOR: başka kullanıcı (sellerBusiness) bu ürünü güncellemeyi dener → engellenir
    const strangerToken = await apiLogin(request, USERS.sellerBusiness);
    const idor = await request.patch(`${API}/products/${productId}`, {
      headers: auth(strangerToken),
      data: { title: 'Saldırgan başlık değişikliği' },
    });
    expect(idor.ok(), 'yabancı güncelleyememeli').toBeFalsy();
    expect([403, 404]).toContain(idor.status());
    // Veri değişmediğini doğrula
    const dbStillOwner = await dbFind(request, 'product', { id: productId }, { title: true });
    expect(dbStillOwner?.title, 'IDOR sonrası başlık değişmedi').toBe(newTitle);

    // 3b) IDOR: yabancı silmeyi dener → engellenir
    const idorDelete = await request.delete(`${API}/products/${productId}`, { headers: auth(strangerToken) });
    expect(idorDelete.ok(), 'yabancı silememeli').toBeFalsy();
    expect([403, 404]).toContain(idorDelete.status());

    // 4) Sahip ürünü siler (DELETE /products/:id) → liste/detayda artık aktif görünmez
    const del = await request.delete(`${API}/products/${productId}`, { headers: auth(ownerToken) });
    expect(del.ok(), 'sahip silebilir').toBeTruthy();
    // Public detayda artık 404/erişilemez (silme soft/hard olabilir; aktif değil)
    const afterDelete = await request.get(`${API}/products/${productId}`);
    expect(afterDelete.ok(), 'silinen ürün public detayda görünmez').toBeFalsy();
  });
});
