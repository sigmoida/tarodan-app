/**
 * J57 — Ürün beğenme ve geri alma
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

test.describe('J57 — Ürün beğenme ve istek listesi', () => {
  test('beğen→liste ekle→beğeniyi geri al→listeden çıkar', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me?.id);

    // 1) Üye bir ürünü beğendi (POST /products/:id/like → {liked,likeCount})
    const like = await request.post(`${API}/products/${product.id}/like`, { headers: auth(token), data: {} });
    expect(like.ok() || like.status() === 400, 'beğeni isteği işlendi (zaten beğenili olabilir)').toBeTruthy();
    // Beğeni durumu kesin: GET /products/:id/liked
    const likedCheck = await request.get(`${API}/products/${product.id}/liked`, { headers: auth(token) });
    expect(likedCheck.ok()).toBeTruthy();
    expect((await likedCheck.json())?.liked, 'ürün beğenili').toBe(true);

    // 2) Aynı ürünü istek listesine ekle (POST /wishlist {productId})
    const addWish = await request.post(`${API}/wishlist`, {
      headers: auth(token),
      data: { productId: product.id },
    });
    expect(addWish.ok(), 'istek listesine eklendi').toBeTruthy();
    const inWish = await request.get(`${API}/wishlist/check/${product.id}`, { headers: auth(token) });
    expect((await inWish.json())?.inWishlist, 'wishlist içinde').toBe(true);

    // 3) Beğeniyi geri al (DELETE /products/:id/unlike)
    const unlike = await request.delete(`${API}/products/${product.id}/unlike`, { headers: auth(token) });
    expect(unlike.ok(), 'beğeni geri alındı').toBeTruthy();
    const likedAfter = await request.get(`${API}/products/${product.id}/liked`, { headers: auth(token) });
    expect((await likedAfter.json())?.liked, 'artık beğenili değil').toBe(false);

    // 4) Ürünü istek listesinden çıkar (DELETE /wishlist/:productId → 204)
    const removeWish = await request.delete(`${API}/wishlist/${product.id}`, { headers: auth(token) });
    expect(removeWish.ok(), 'wishlistten çıkarıldı (204)').toBeTruthy();
    const inWishAfter = await request.get(`${API}/wishlist/check/${product.id}`, { headers: auth(token) });
    expect((await inWishAfter.json())?.inWishlist, 'artık wishlistte yok').toBe(false);
  });
});
