/**
 * J60 — Kendi ürününü satın alma/teklif verme engeli
 * Kaynak: suite-c-cart.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * Suite C — Sepet ve Checkout journey'leri (J33, J58, J59, J60, J62, J65).
 *
 * Manuel turun birebir karsiligi: her adimda SONUC assert edilir
 * (cart API durumu, DB order kaydi, tutar/indirim, 4xx red kontrolu, IDOR).
 *
 * Endpointler controller'dan dogrulandi:
 *  - cart.controller.ts:  POST /cart/items {productId,quantity}; PATCH /cart/items/:productId {quantity};
 *                         DELETE /cart/items/:productId; GET /cart; POST /cart/coupon {code}; DELETE /cart/coupon
 *  - order.controller.ts: POST /orders/buy {productId,shippingAddressId}; GET /orders/:id;
 *                         PATCH /orders/:id/shipping-address {fullName,phone,city,district,address,zipCode?}
 *  - discount.controller.ts: POST /discounts (kupon yarat); seed'de hazir kupon YOK -> testte yaratiyoruz
 *  - offer.controller.ts: POST /offers {productId,amount}
 *  - product.controller.ts: GET /products/my (satici kendi urunleri)
 *
 * Hibrit (API + UI). loginViaToken protected sayfa dogrulamasinda kullanilir.
 */
import { test, expect } from '@playwright/test';
import {
  API, USERS, loginViaToken, apiLogin, apiMe, apiFirstBuyableProduct,
  apiDefaultAddressId, apiBuyAndPay, apiGetOrder,
} from '../support/helpers';
import { dbFind, dbCount } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Satin alinabilir, alicinin kendisine ait OLMAYAN, stoklu bir urun bul. */
async function buyableProduct(request: any, buyerId: string) {
  return apiFirstBuyableProduct(request, buyerId);
}

/** Bir kullanicinin (satici) kendi aktif urununu bul. */
async function ownActiveProduct(request: any, token: string) {
  const res = await request.get(`${API}/products/my`, { headers: auth(token), params: { limit: '50' } });
  expect(res.ok(), 'GET /products/my').toBeTruthy();
  const body = await res.json();
  const list: any[] = body?.data ?? body?.products ?? (Array.isArray(body) ? body : []);
  const p = list.find((x) => x.status === 'active');
  expect(p, 'saticinin aktif kendi urunu bulundu').toBeTruthy();
  return p;
}

/** Sepeti temizle (test izolasyonu). */
async function clearCart(request: any, token: string) {
  await request.delete(`${API}/cart`, { headers: auth(token) }).catch(() => {});
}

// ───────────────────────────────────────────────────────────────────────────
// J33 — Sepet kurallari: stok siniri, kendi urunu engeli, qty=0 ile cikarma
// ───────────────────────────────────────────────────────────────────────────

test.describe('J60 — Kendi urunu engeli (sepet / teklif / Hemen Al)', () => {
  test('satici kendi urununu sepete/teklif/hemen-al ile alamaz, baskasininkini normal alir', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const sellerMe = await apiMe(request, sellerToken);
    const own = await ownActiveProduct(request, sellerToken);
    await clearCart(request, sellerToken);

    // 1) Kendi urununu sepete ekle -> engellenir (400 "Kendi urununuzu satin alamazsiniz")
    const cartAdd = await request.post(`${API}/cart/items`, { headers: auth(sellerToken), data: { productId: own.id, quantity: 1 } });
    expect(cartAdd.ok(), 'kendi urunu sepete eklenemez').toBeFalsy();
    expect([400, 403]).toContain(cartAdd.status());

    // 2) Kendi urunune teklif ver -> engellenir
    const offerRes = await request.post(`${API}/offers`, {
      headers: auth(sellerToken),
      data: { productId: own.id, amount: Math.max(1, Math.round(Number(own.price) * 0.8)) },
    });
    expect(offerRes.ok(), 'kendi urunune teklif verilemez').toBeFalsy();
    expect([400, 403]).toContain(offerRes.status());
    // DB: bu satici-urun cifti icin teklif olusmamali
    const offerCount = await dbCount(request, 'offer', { productId: own.id, buyerId: sellerMe.id });
    expect(offerCount, 'kendi urunune teklif kaydi yok').toBe(0);

    // 3) Kendi urununu 'Hemen Al' ile al -> engellenir (403/400)
    const addressId = await apiDefaultAddressId(request, sellerToken);
    const buyRes = await request.post(`${API}/orders/buy`, { headers: auth(sellerToken), data: { productId: own.id, shippingAddressId: addressId } });
    expect(buyRes.ok(), 'kendi urununu Hemen Al ile alamaz').toBeFalsy();
    expect([400, 403]).toContain(buyRes.status());

    // 4) Baska bir saticinin urununu normal satin al, akis bitti.
    const other = await apiFirstBuyableProduct(request, sellerMe.id); // kendisi olmayan
    expect(other.sellerId).not.toBe(sellerMe.id);
    const { orderId } = await apiBuyAndPay(request, sellerToken, other.id);
    const order = await dbFind(request, 'order', { id: orderId }, { id: true, status: true, buyerId: true, sellerId: true });
    expect(order.buyerId).toBe(sellerMe.id);
    expect(order.sellerId).not.toBe(sellerMe.id);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);
  });
});
