/**
 * J52 — Katalog gezinme: olmayan kategori ve marka
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

test.describe('J52 — Olmayan kategori/marka 404, var olanlar açılır', () => {
  test('kategori/marka listesi gelir, var olan açılır, olmayan 404 döner', async ({ request }) => {
    // 1) Misafir kategori listesini açtı → liste dolu gelir
    const catsRes = await request.get(`${API}/categories`);
    expect(catsRes.ok(), 'GET /categories 200').toBeTruthy();
    const cats: any[] = await catsRes.json();
    expect(Array.isArray(cats) && cats.length > 0, 'en az bir kategori').toBeTruthy();
    const catSlug: string = cats[0].slug;
    expect(catSlug, 'kategori slug').toBeTruthy();

    // 2) Var olan kategori slug ile açılır (sonuç: doğru slug döner)
    const catOk = await request.get(`${API}/categories/slug/${catSlug}`);
    expect(catOk.ok(), 'var olan kategori 200').toBeTruthy();
    expect((await catOk.json())?.slug).toBe(catSlug);

    // 3) Var olmayan kategori adresi → 404 (NotFoundException)
    const catMissing = await request.get(`${API}/categories/slug/bu-kategori-yok-${Date.now()}`);
    expect(catMissing.ok(), 'olmayan kategori reddedilmeli').toBeFalsy();
    expect(catMissing.status(), 'olmayan kategori 404').toBe(404);

    // 4) Marka listesinden bir markaya gir → ürünleri gör
    const brandsRes = await request.get(`${API}/brands`);
    expect(brandsRes.ok(), 'GET /brands 200').toBeTruthy();
    const brands: any[] = await brandsRes.json();
    expect(Array.isArray(brands) && brands.length > 0, 'en az bir marka').toBeTruthy();
    const brandSlug: string = brands[0].slug;

    const brandOk = await request.get(`${API}/brands/${brandSlug}`);
    expect(brandOk.ok(), 'var olan marka 200').toBeTruthy();
    expect((await brandOk.json())?.slug).toBe(brandSlug);

    // 5) Olmayan marka adresi → 404
    const brandMissing = await request.get(`${API}/brands/bu-marka-yok-${Date.now()}`);
    expect(brandMissing.ok(), 'olmayan marka reddedilmeli').toBeFalsy();
    expect(brandMissing.status(), 'olmayan marka 404').toBe(404);

    // Akış bitişi: normal arama da sonuç döner (yapı bozulmamış)
    const search = await request.get(`${API}/search/products`, { params: { q: '' } });
    expect(search.ok(), 'arama 200').toBeTruthy();
  });
});
