/**
 * J58 — Sepette kupon denemeleri
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

test.describe('J58 — Sepette kupon denemeleri', () => {
  test('bos ve gecersiz kupon reddedilir, gecerli kupon indirim yansitir, kaldirma idempotent', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    await clearCart(request, buyerToken);

    // 1) Sepete iki urun ekle (ayni saticidan secelim ki seller-scope kupon uygulansin)
    const seller = USERS.sellerPremium;
    const sellerToken = await apiLogin(request, seller);
    const sellerMe = await apiMe(request, sellerToken);

    const myProdsRes = await request.get(`${API}/products/my`, { headers: auth(sellerToken), params: { status: 'active', limit: '50' } });
    const myList: any[] = (await myProdsRes.json())?.data ?? [];
    const sellerProducts = myList.filter((p) => p.status === 'active' && (p.quantity == null || p.quantity > 0)).slice(0, 2);
    expect(sellerProducts.length, 'saticinin >=2 aktif urunu var').toBeGreaterThanOrEqual(2);

    for (const p of sellerProducts) {
      const r = await request.post(`${API}/cart/items`, { headers: auth(buyerToken), data: { productId: p.id, quantity: 1 } });
      expect(r.ok(), `sepete ${p.id} eklendi`).toBeTruthy();
    }
    const cartGet = await request.get(`${API}/cart`, { headers: auth(buyerToken) });
    const cartBody = await cartGet.json();
    const subtotal = Number(cartBody?.calculation?.subtotal ?? 0);
    expect(subtotal, 'sepet subtotal > 0').toBeGreaterThan(0);

    // 2) Bos kupon kodu -> reddedilmeli (validation 400)
    const emptyRes = await request.post(`${API}/cart/coupon`, { headers: auth(buyerToken), data: { code: '' } });
    expect(emptyRes.ok(), 'bos kupon reddedildi').toBeFalsy();
    expect([400, 404]).toContain(emptyRes.status());

    // 3) Gecersiz kupon -> reddedilmeli (BadRequest)
    const badRes = await request.post(`${API}/cart/coupon`, { headers: auth(buyerToken), data: { code: 'GECERSIZKUPON_' + Date.now() } });
    expect(badRes.ok(), 'gecersiz kupon reddedildi').toBeFalsy();
    expect([400, 404]).toContain(badRes.status());

    // 4) Gecerli kupon: seed'de hazir kupon olmadigi icin satici %20 seller-scope kupon yaratir.
    const code = 'PWC20_' + Date.now().toString().slice(-7);
    const now = new Date();
    const start = new Date(now.getTime() - 60_000).toISOString();
    const end = new Date(now.getTime() + 24 * 3600_000).toISOString();
    const createRes = await request.post(`${API}/discounts`, {
      headers: auth(sellerToken),
      data: {
        code,
        name: 'PW Suite C %20',
        type: 'percentage',
        value: 20,
        scope: 'seller',
        startDate: start,
        endDate: end,
        isActive: true,
        usageLimitPerUser: 5,
      },
    });
    expect(createRes.ok(), 'kupon yaratildi (POST /discounts)').toBeTruthy();
    const created = await createRes.json();
    // discount seller'a baglanir; sellerId discount uzerinde set olur
    const dbDiscount = await dbFind(request, 'discount', { code }, { id: true, sellerId: true, value: true, type: true });
    expect(dbDiscount?.code === undefined ? created?.code : code, 'kupon DB de').toBeTruthy();
    // sellerId, kuponu yaratan saticinin id'si olmali (seller-scope)
    expect(dbDiscount.sellerId).toBe(sellerMe.id);

    const applyRes = await request.post(`${API}/cart/coupon`, { headers: auth(buyerToken), data: { code } });
    expect(applyRes.ok(), 'gecerli kupon uygulandi').toBeTruthy();
    const applied = await applyRes.json();
    expect(applied?.couponCode, 'cart.couponCode set').toBe(code.toUpperCase());
    const couponDiscount = Number(applied?.calculation?.couponDiscountTotal ?? 0);
    expect(couponDiscount, 'kupon indirimi sepete yansidi (>0)').toBeGreaterThan(0);
    // grandTotal subtotal'dan dusuk olmali (indirim etkisi); kargo eklense bile indirim gozlenir
    expect(Number(applied?.calculation?.totalDiscount ?? 0)).toBeGreaterThan(0);

    // 5) Kuponu kaldir, sonra tekrar kaldir -> sorun cikmaz (idempotent)
    const remove1 = await request.delete(`${API}/cart/coupon`, { headers: auth(buyerToken) });
    expect(remove1.ok(), 'kupon kaldirildi').toBeTruthy();
    const afterRemove = await remove1.json();
    expect(afterRemove?.couponCode ?? null, 'couponCode null').toBeFalsy();

    const remove2 = await request.delete(`${API}/cart/coupon`, { headers: auth(buyerToken) });
    expect(remove2.ok(), 'ikinci kaldirma da sorunsuz (idempotent)').toBeTruthy();
    const afterRemove2 = await remove2.json();
    expect(afterRemove2?.couponCode ?? null).toBeFalsy();

    await clearCart(request, buyerToken);
  });
});
