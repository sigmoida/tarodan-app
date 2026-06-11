/**
 * J62 — Tekrarlanan satın alma tek sipariş açıyor
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

test.describe('J62 — Cift Hemen Al tek siparis (idempotency)', () => {
  test('ayni urune iki kez Hemen Al ayni pending siparisi doner, ode -> tamamlanir', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await buyableProduct(request, me.id);
    const addressId = await apiDefaultAddressId(request, token);

    // 1) Ilk 'Hemen Al' -> pending_payment siparis olusur
    const buy1 = await request.post(`${API}/orders/buy`, { headers: auth(token), data: { productId: product.id, shippingAddressId: addressId } });
    expect(buy1.ok(), 'ilk Hemen Al').toBeTruthy();
    const b1 = await buy1.json();
    const orderId1 = b1?.orderId ?? b1?.id;
    expect(orderId1, 'ilk orderId').toBeTruthy();

    const order1 = await dbFind(request, 'order', { id: orderId1 }, { id: true, status: true });
    expect(order1.status, 'ilk siparis pending_payment').toBe('pending_payment');

    // 2) Sayfayi yenileyip tekrar 'Hemen Al' (ayni urun, ayni alici)
    const buy2 = await request.post(`${API}/orders/buy`, { headers: auth(token), data: { productId: product.id, shippingAddressId: addressId } });
    expect(buy2.ok(), 'ikinci Hemen Al').toBeTruthy();
    const b2 = await buy2.json();
    const orderId2 = b2?.orderId ?? b2?.id;

    // 3) Yeni siparis acilmadi -> ayni orderId donmeli (createDirectOrder existingOrder mantigi)
    expect(orderId2, 'ikinci cagri ayni siparisi dondurdu').toBe(orderId1);
    // DB: bu urun+alici icin pending siparis sayisi 1
    const pendingCount = await dbCount(request, 'order', { productId: product.id, buyerId: me.id, status: 'pending_payment' });
    expect(pendingCount, 'tek bekleyen siparis').toBe(1);

    // 4) Alici oder, siparis ilerler (initiate + bypass-complete)
    const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(token), data: { orderId: orderId1, provider: 'paytr' } });
    expect(initRes.ok(), 'payments/initiate').toBeTruthy();
    const initBody = await initRes.json();
    const paymentId = initBody?.paymentId;
    expect(paymentId, 'paymentId').toBeTruthy();
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), 'bypass-complete').toBeTruthy();

    const finalOrder = await apiGetOrder(request, token, orderId1);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(finalOrder?.status);
  });
});
