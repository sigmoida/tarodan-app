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
test.describe('J33 — Sepet kurallari (stok / kendi urunu / qty0)', () => {
  test('stok asimi reddedilir, kendi urunu engellenir, qty0 satiri kaldirir, gecerli urunle tamamlanir', async ({ page, request }) => {
    test.setTimeout(60_000);

    // buyerClean: ilani yok, her urunu alabilir
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    await clearCart(request, token);

    // 1) Bir urunu sepete ekle
    const product = await buyableProduct(request, me.id);
    const add1 = await request.post(`${API}/cart/items`, {
      headers: auth(token),
      data: { productId: product.id, quantity: 1 },
    });
    expect(add1.ok(), 'urun sepete eklendi').toBeTruthy();
    const cart1 = await add1.json();
    const inCart = cart1?.calculation?.items?.find((i: any) => i.productId === product.id);
    expect(inCart?.quantity, 'sepette 1 adet').toBe(1);

    // 2) Stoktan fazla adet eklemeyi dene -> kabul edilmemeli.
    //    DTO Max=99 oldugundan stok kontrolunu test etmek icin gercek stok degerini kullaniriz.
    const stock: number | null = product.quantity ?? null;
    if (typeof stock === 'number' && stock + 1 <= 99) {
      // PATCH ile mevcut satiri stok+1'e cek -> "Stokta sadece X adet var" (400)
      const over = await request.patch(`${API}/cart/items/${product.id}`, {
        headers: auth(token),
        data: { quantity: stock + 1 },
      });
      expect(over.ok(), 'stok asimi reddedildi').toBeFalsy();
      expect([400, 409]).toContain(over.status());
    } else {
      // Stok cok yuksek/null -> DTO Max=99 ustu deger ValidationPipe ile 400 verir (yine "kabul edilmedi").
      const over = await request.patch(`${API}/cart/items/${product.id}`, {
        headers: auth(token),
        data: { quantity: 100 }, // Max=99
      });
      expect(over.ok(), 'asiri adet (DTO Max=99) reddedildi').toBeFalsy();
      expect([400, 409]).toContain(over.status());
    }

    // 3) Kendi urununu sepete eklemeyi dene -> engellenmeli.
    //    buyerClean satici degil; bu yuzden bir saticiyla onun kendi urununu deneriz.
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const own = await ownActiveProduct(request, sellerToken);
    const selfAdd = await request.post(`${API}/cart/items`, {
      headers: auth(sellerToken),
      data: { productId: own.id, quantity: 1 },
    });
    expect(selfAdd.ok(), 'kendi urununu sepete ekleme engellendi').toBeFalsy();
    expect([400, 403]).toContain(selfAdd.status());

    // 4) Adedi 0 yap -> urun sepetten cikmali.
    const toZero = await request.patch(`${API}/cart/items/${product.id}`, {
      headers: auth(token),
      data: { quantity: 0 },
    });
    expect(toZero.ok(), 'qty=0 islemi').toBeTruthy();
    const cartAfter = await toZero.json();
    const stillThere = cartAfter?.calculation?.items?.find((i: any) => i.productId === product.id);
    expect(stillThere, 'urun sepetten cikti').toBeFalsy();

    // 5) Baska bir urunu ekleyip sepeti tamamla (Hemen Al + ode), akis bitti.
    const product2 = await buyableProduct(request, me.id);
    const { orderId } = await apiBuyAndPay(request, token, product2.id);
    const order = await dbFind(request, 'order', { id: orderId }, { id: true, status: true, buyerId: true });
    expect(order.buyerId).toBe(me.id);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);

    // UI dogrulama: alici kendi siparisini goruyor
    await loginViaToken(page, token);
    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(page.url()).toContain(`/orders/${orderId}`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J58 — Sepette kupon denemeleri (bos / gecersiz / gecerli / kaldir x2)
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

// ───────────────────────────────────────────────────────────────────────────
// J59 — Sepet izolasyonu: baskasinin sepeti gorunmuyor (IDOR yok)
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

// ───────────────────────────────────────────────────────────────────────────
// J60 — Kendi urununu satin alma / teklif verme engeli
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

// ───────────────────────────────────────────────────────────────────────────
// J62 — Cift 'Hemen Al' tek siparis (idempotency)
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

// ───────────────────────────────────────────────────────────────────────────
// J65 — Odeme oncesi adres degisimi + IDOR
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
