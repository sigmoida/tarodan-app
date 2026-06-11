/**
 * J65 — Sipariş adresini ödeme öncesi değiştirme
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

test.describe('J65 — Odeme oncesi adres degisimi + IDOR', () => {
  test('alici pending siparis adresini degistirir, baska kullanici degistiremez, ode -> ilerler', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await buyableProduct(request, me.id);

    // 1) (yeni adres temsili) — adres bilgileri inline gonderilecek (SetShippingAddressDto)
    const newAddress = {
      fullName: 'PW Yeni Adres',
      phone: '+905551112233',
      city: 'Ankara',
      district: 'Cankaya',
      address: 'PW Mah. Test Sok. No:42',
      zipCode: '06420',
    };

    // 2) 'Hemen Al' -> pending_payment siparis (kayitli adresle)
    const addressId = await apiDefaultAddressId(request, token);
    const buy = await request.post(`${API}/orders/buy`, { headers: auth(token), data: { productId: product.id, shippingAddressId: addressId } });
    expect(buy.ok(), 'Hemen Al').toBeTruthy();
    const orderId = (await buy.json())?.orderId;
    expect(orderId, 'orderId').toBeTruthy();
    const before = await dbFind(request, 'order', { id: orderId }, { id: true, status: true, shippingAddress: true });
    expect(before.status).toBe('pending_payment');

    // 3) Odemeden ONCE teslimat adresini degistir (PATCH /orders/:id/shipping-address)
    const patchRes = await request.patch(`${API}/orders/${orderId}/shipping-address`, { headers: auth(token), data: newAddress });
    expect(patchRes.ok(), 'adres degisimi (alici)').toBeTruthy();
    // DB: shippingAddress yeni sehir/adres ile guncellenmis
    const after = await dbFind(request, 'order', { id: orderId }, { id: true, shippingAddress: true });
    const addr = after?.shippingAddress as any;
    expect(addr?.city, 'sehir guncellendi').toBe('Ankara');
    expect(addr?.address, 'adres guncellendi').toContain('PW Mah.');

    // 4) Baska biri (B) bu siparisin adresini degistirmeye calisir -> engellenir (403/404)
    const bToken = await apiLogin(request, USERS.buyer); // farkli kullanici
    const idorPatch = await request.patch(`${API}/orders/${orderId}/shipping-address`, {
      headers: auth(bToken),
      data: { ...newAddress, city: 'Izmir', address: 'Saldirgan adresi' },
    });
    expect(idorPatch.ok(), 'baska kullanici adresi degistiremez').toBeFalsy();
    expect([403, 404]).toContain(idorPatch.status());
    // DB: adres hala Ankara (degismemis)
    const afterIdor = await dbFind(request, 'order', { id: orderId }, { id: true, shippingAddress: true });
    expect((afterIdor?.shippingAddress as any)?.city, 'IDOR sonrasi adres korundu').toBe('Ankara');

    // 5) Alici oder, siparis yeni adrese ilerler
    const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(token), data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), 'payments/initiate').toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), 'bypass-complete').toBeTruthy();

    const finalOrder = await dbFind(request, 'order', { id: orderId }, { id: true, status: true, shippingAddress: true });
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(finalOrder.status);
    expect((finalOrder.shippingAddress as any)?.city, 'odeme sonrasi yeni adres korundu').toBe('Ankara');
  });
});
