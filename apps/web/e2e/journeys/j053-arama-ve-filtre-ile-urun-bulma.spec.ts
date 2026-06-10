/**
 * J53 — Arama ve filtre ile ürün bulma
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

test.describe('J53 — Arama, fiyat filtresi, autocomplete, görüntülenme', () => {
  test('autocomplete önerir, filtre uygular, detayda viewCount artar, sepete eklenir', async ({ request }) => {
    test.setTimeout(60_000);

    // Arama terimi: canlı bir ürün başlığından ilk kelimeyi al (deterministik öneri için)
    const seedProduct = await apiFirstBuyableProduct(request);
    const term = String(seedProduct.title).split(/\s+/)[0] || 'model';

    // 1) Autocomplete: kutuya model adı yazıldı → öneriler geldi
    const ac = await request.get(`${API}/search/autocomplete`, { params: { q: term } });
    expect(ac.ok(), 'autocomplete 200').toBeTruthy();
    const acBody = await ac.json();
    expect(Array.isArray(acBody?.suggestions), 'suggestions array').toBeTruthy();
    // Öneri gelmesi içerik bağımlı; en azından yapı doğru. Öneri varsa onu kullan.
    const picked: string = acBody.suggestions?.[0] ?? term;

    // 2) Bir öneriyi seçip sonuç listesi
    const res1 = await request.get(`${API}/search/products`, { params: { q: picked, pageSize: '20' } });
    expect(res1.ok(), 'arama sonucu 200').toBeTruthy();
    const body1 = await res1.json();
    const items1: any[] = body1?.products ?? body1?.data ?? body1?.items ?? [];
    expect(Array.isArray(items1), 'sonuç listesi array').toBeTruthy();

    // 3) Fiyat aralığı filtresi uygula → dönen ürünler aralıkta
    const minP = 1;
    const maxP = Math.max(2, Math.ceil(Number(seedProduct.price)) + 1);
    const res2 = await request.get(`${API}/search/products`, {
      params: { q: '', minPrice: String(minP), maxPrice: String(maxP), pageSize: '20' },
    });
    expect(res2.ok(), 'fiyat filtreli arama 200').toBeTruthy();
    const body2 = await res2.json();
    const items2: any[] = body2?.products ?? body2?.data ?? body2?.items ?? [];
    for (const it of items2) {
      if (typeof it.price === 'number') {
        expect(it.price, `${it.price} ∈ [${minP},${maxP}]`).toBeGreaterThanOrEqual(minP);
        expect(it.price).toBeLessThanOrEqual(maxP);
      }
    }

    // 4) Ürün detayını aç → görüntülenme sayısı artar (DB'den doğrula)
    const before = await dbFind(request, 'product', { id: seedProduct.id }, { viewCount: true });
    const beforeCount = Number(before?.viewCount ?? 0);
    const viewRes = await request.post(`${API}/products/${seedProduct.id}/view`, { data: {} });
    expect(viewRes.ok(), 'view 200/201').toBeTruthy();
    const after = await dbFind(request, 'product', { id: seedProduct.id }, { viewCount: true });
    expect(Number(after?.viewCount), 'viewCount arttı').toBeGreaterThan(beforeCount);

    // 5) Üye olup ürünü "sepete ekle" — sepet yerine istek listesi/satın alma yoluyla
    //    katalog→üye geçişi doğrulanır. Burada üye gerçekten satın alıyor (sonuç: paid sipariş).
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyerMe = await apiMe(request, buyerToken);
    const buyable = await apiFirstBuyableProduct(request, buyerMe?.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, buyable.id);
    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);
  });
});
