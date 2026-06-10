/**
 * J59 — Sepet izolasyonu: başkasının sepeti görünmüyor
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

test.describe('J59 — Sepet izolasyonu (IDOR)', () => {
  test('A sepete urun ekler, B A`nin sepetini goremez, B kendi bos sepetiyle alir', async ({ request }) => {
    test.setTimeout(60_000);

    // A = buyer (mehmet), B = buyerClean (deniz)
    const aToken = await apiLogin(request, USERS.buyer);
    const aMe = await apiMe(request, aToken);
    const bToken = await apiLogin(request, USERS.buyerClean);
    const bMe = await apiMe(request, bToken);

    await clearCart(request, aToken);
    await clearCart(request, bToken);

    // 1) A sepetine urun ekler
    const aProduct = await buyableProduct(request, aMe.id);
    const aAdd = await request.post(`${API}/cart/items`, { headers: auth(aToken), data: { productId: aProduct.id, quantity: 1 } });
    expect(aAdd.ok(), 'A sepete urun ekledi').toBeTruthy();

    // DB: A nin sepetinde item var
    const aCartGet = await request.get(`${API}/cart`, { headers: auth(aToken) });
    const aCart = await aCartGet.json();
    expect(aCart?.calculation?.itemCount, 'A sepetinde >=1 urun').toBeGreaterThanOrEqual(1);
    const aCartId = aCart?.id;
    expect(aCartId).toBeTruthy();

    // 2) B, A nin sepetini gormeye calisir.
    //    Cart endpoint'i userId bazli (param almaz); B kendi token'iyla GET /cart yapinca
    //    KENDI sepetini gorur, A nin degil. IDOR: B, A nin sepet ID'siyle item silmeyi denerse
    //    A nin urunu uzerinden silme yapamaz (cart kullanicinin kendisine baglidir).
    const bSeesOwn = await request.get(`${API}/cart`, { headers: auth(bToken) });
    const bCart = await bSeesOwn.json();
    expect(bCart?.userId, 'B kendi sepetini gorur').toBe(bMe.id);
    expect(bCart?.id, 'B`nin sepeti A`ninkinden farkli').not.toBe(aCartId);

    // IDOR denemesi: B, A nin sepetindeki urunu kendi token'iyla silmeye calisir.
    // Cart kullaniciya bagli oldugundan B`nin sepetinde o urun YOK -> 404 (A`nin urununu silemez).
    const idorDelete = await request.delete(`${API}/cart/items/${aProduct.id}`, { headers: auth(bToken) });
    expect(idorDelete.ok(), 'B, A`nin sepet urununu silemez').toBeFalsy();
    expect([403, 404]).toContain(idorDelete.status());

    // A nin sepeti hala dokunulmamis
    const aCartAfter = await (await request.get(`${API}/cart`, { headers: auth(aToken) })).json();
    expect(aCartAfter?.calculation?.itemCount, 'A sepeti etkilenmedi').toBeGreaterThanOrEqual(1);

    // 3) B kendi sepetini acti -> bos
    expect(bCart?.calculation?.itemCount ?? 0, 'B sepeti bos').toBe(0);

    // 4) B kendi urununu ekleyip oder (Hemen Al), akis bitti
    const bProduct = await buyableProduct(request, bMe.id);
    const { orderId } = await apiBuyAndPay(request, bToken, bProduct.id);
    const order = await dbFind(request, 'order', { id: orderId }, { id: true, status: true, buyerId: true });
    expect(order.buyerId).toBe(bMe.id);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);

    await clearCart(request, aToken);
  });
});
