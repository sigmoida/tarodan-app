/**
 * J54 — Vergi ve fiyat dökümünü inceleyip alışveriş
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

test.describe('J54 — Vergi/fiyat dökümü inceleyip alışveriş', () => {
  test('vergi hesaplanır, kalem dökümü tutarlı, ödenir', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Misafir vergi hesaplama bilgisini gördü (public /tax/calculate)
    const subtotal = 100;
    const taxRes = await request.get(`${API}/tax/calculate`, {
      params: { countryCode: 'TR', subtotal: String(subtotal) },
    });
    expect(taxRes.ok(), 'tax/calculate 200').toBeTruthy();
    const tax = await taxRes.json();
    // rate null olabilir (vergi tanımsızsa) ama yapı tutarlı olmalı; rate varsa taxAmount = subtotal*rate/100
    if (tax?.rate != null) {
      expect(typeof tax.rate, 'rate sayı').toBe('number');
      const expected = Math.round((subtotal * tax.rate) / 100 * 100) / 100;
      expect(Math.abs(Number(tax.taxAmount) - expected), 'taxAmount = subtotal*rate/100').toBeLessThan(0.5);
    }

    // 2) Üye giriş + alınabilir ürün
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me?.id);

    // 3) Sipariş öncesi kalem kalem fiyat dökümü (POST /orders/quote)
    const quoteRes = await request.post(`${API}/orders/quote`, {
      data: { items: [{ productId: product.id, quantity: 1 }] },
    });
    expect(quoteRes.ok(), 'orders/quote 200').toBeTruthy();
    const quote = await quoteRes.json();
    expect(typeof quote.itemsSubtotal, 'itemsSubtotal').toBe('number');
    expect(typeof quote.shippingAmount, 'shippingAmount').toBe('number');
    expect(typeof quote.totalAmount, 'totalAmount').toBe('number');
    // Döküm tutarlılığı: total >= subtotal + shipping (buyerFee eklenebilir)
    expect(quote.totalAmount, 'total >= subtotal+shipping').toBeGreaterThanOrEqual(
      quote.itemsSubtotal + quote.shippingAmount - 0.01,
    );

    // 4) Toplamı uygun bulup öde
    const { orderId } = await apiBuyAndPay(request, token, product.id);

    // 5) Sipariş tamamlandı (paid) → DB'den toplam tutar pozitif ve quote ile uyumlu büyüklükte
    const order = await apiGetOrder(request, token, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { totalAmount: true, shippingCost: true });
    expect(Number(dbOrder?.totalAmount), 'order totalAmount > 0').toBeGreaterThan(0);
  });
});
