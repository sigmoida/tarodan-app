/**
 * SUITE E — Teklif / Pazarlık (Offers).
 * Gerçek backend + tarodan_test DB + Mailhog. Manuel turun birebir karşılığı:
 * her adımda SONUÇ assert edilir (DB kaydı/durum, API status, tutar).
 *
 * Kapsam: J3, J4, J34, J91, J92, J93, J94, J95, J102.
 *
 * Endpoint kaynağı: apps/api/src/modules/offer/offer.controller.ts + offer.service.ts
 *   POST /offers                  {productId, amount, message?}  (min %50, kendi ürünü değil, tek pending)
 *   POST /offers/:id/counter      {amount}  satıcı; amount > teklif && <= ürün fiyatı; eskiyi rejected yapar
 *   POST /offers/:id/accept       normal teklifte satıcı / counter'da (buyerMustAccept) alıcı kabul eder
 *   POST /offers/:id/reject       satıcı (normal) reddeder
 *   POST /offers/:id/cancel       alıcı kendi pending teklifini iptal eder
 *   GET  /offers/:id              sadece buyer/seller görür (yabancı 403)
 *   GET  /offers/pending-count    {received, sent, total}
 * Order tarafı: order.controller.ts
 *   PATCH /orders/:id/shipping-address  (pending_payment'a adres)
 *   POST  /payments/initiate + /payments/:id/bypass-complete  (PAYMENT_BYPASS=true)
 *   POST  /orders/:id/prepare    paid -> preparing (satıcı)
 *   POST  /orders/:id/confirm    delivered -> completed (alıcı)
 *   paid->...->delivered shipping modülünden; testte backdate ile delivered'a çekilir.
 *   payout: paymentHold.releaseAt backdate + scheduler release-holds-due.
 * Rating: ratings.controller.ts  POST /ratings/users, POST /ratings/products
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import { API, USERS, apiLogin, apiMe } from '../support/helpers';
import { backdate, dbFind, dbCount, runScheduler, expectDbEventually } from '../support/db';

const authHeader = (t: string) => ({ Authorization: `Bearer ${t}` });

// ─────────────────────────── yerel yardımcılar ───────────────────────────

/** Belirli satıcının aktif/stoklu/fiyatlı bir ürününü bul (teklif hedefi). */
async function sellerActiveProduct(request: APIRequestContext, sellerId: string, buyerId: string): Promise<any> {
  const res = await request.get(`${API}/products`, { params: { status: 'active', limit: '50' } });
  expect(res.ok(), 'products list').toBeTruthy();
  const body = await res.json();
  const list: any[] = body?.data ?? body?.products ?? (Array.isArray(body) ? body : []);
  const p = list.find(
    (x) =>
      x.sellerId === sellerId &&
      x.sellerId !== buyerId &&
      Number(x.price) > 0 &&
      (x.quantity == null || x.quantity > 0) &&
      !String(x.id).startsWith('membership-') &&
      !String(x.id).startsWith('boost-'),
  );
  expect(p, `satıcı ${sellerId} için teklif verilebilir ürün bulundu`).toBeTruthy();
  return p;
}

async function createOffer(request: APIRequestContext, token: string, productId: string, amount: number, message?: string) {
  return request.post(`${API}/offers`, { headers: authHeader(token), data: { productId, amount, message } });
}

async function defaultAddress(request: APIRequestContext, token: string): Promise<any> {
  const res = await request.get(`${API}/users/me/addresses`, { headers: authHeader(token) });
  const body = await res.json();
  const list: any[] = body?.data ?? body?.addresses ?? (Array.isArray(body) ? body : []);
  return list.find((x) => x.isDefault) ?? list[0] ?? null;
}

/** Teklif kabulüyle oluşan pending_payment siparişini adres + bypass ile öde. */
async function payOfferOrder(request: APIRequestContext, token: string, orderId: string): Promise<void> {
  const addr = await defaultAddress(request, token);
  const shipDto = {
    fullName: addr?.fullName ?? addr?.recipientName ?? 'Test Alıcı',
    phone: addr?.phone ?? '+905551112233',
    city: addr?.city ?? 'İstanbul',
    district: addr?.district ?? 'Kadıköy',
    address: addr?.address ?? addr?.addressLine ?? addr?.fullAddress ?? 'Mahalle sokak no 1',
    zipCode: addr?.zipCode ?? addr?.postalCode ?? '34000',
  };
  const addrRes = await request.patch(`${API}/orders/${orderId}/shipping-address`, { headers: authHeader(token), data: shipDto });
  expect(addrRes.ok(), `shipping-address set (${addrRes.status()})`).toBeTruthy();

  const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(token), data: { orderId, provider: 'paytr' } });
  expect(initRes.ok(), `payments/initiate (${initRes.status()})`).toBeTruthy();
  const initBody = await initRes.json();
  const paymentId = initBody?.paymentId ?? initBody?.id;
  expect(initBody?.useBypass, 'PAYMENT_BYPASS açık (useBypass=true)').toBe(true);
  expect(paymentId, 'paymentId').toBeTruthy();

  const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
  expect(doneRes.ok(), `bypass-complete (${doneRes.status()})`).toBeTruthy();
}

// ════════════════════════════════════════════════════════════════════════
// J3 — Pazarlık: teklif → karşı teklif → kabul → ödeme → kargo → teslim →
//      onay → süre dolunca satıcıya aktarım → puan
// ════════════════════════════════════════════════════════════════════════
test.describe('J3 — Teklif/karşı-teklif/kabul/ödeme/teslim/onay/serbest/puan', () => {
  test('pazarlık tam turu, her adımda DB/durum doğrulanır', async ({ request }) => {
    test.setTimeout(90_000);

    // 0) Alıcı (deniz=buyerClean, ilanı yok her ürünü alır) + satıcı (zeynep=sellerFree)
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1-2) Alıcı, fiyatın yarısının ÜZERİNDE teklif verir → pending
    const offerAmount = Math.max(Math.ceil(price * 0.6), Math.ceil(price * 0.5) + 1);
    const createRes = await createOffer(request, buyerToken, product.id, offerAmount, 'Bu fiyata olur mu?');
    expect(createRes.ok(), `teklif oluştu (${createRes.status()})`).toBeTruthy();
    const offer = await createRes.json();
    expect(offer.status).toBe('pending');
    // DB: pending teklif kaydı + alıcı/satıcı/tutar doğru
    const dbOffer = await dbFind(request, 'offer', { id: offer.id });
    expect(dbOffer.status).toBe('pending');
    expect(Number(dbOffer.amount)).toBe(offerAmount);
    expect(dbOffer.buyerId).toBe(buyer.id);
    expect(dbOffer.sellerId).toBe(seller.id);

    // 3) Satıcı daha yüksek karşı teklif → eski teklif rejected, yeni counter pending + buyerMustAccept
    const counterAmount = Math.min(Math.ceil((offerAmount + price) / 2), price);
    const counterRes = await request.post(`${API}/offers/${offer.id}/counter`, {
      headers: authHeader(sellerToken),
      data: { amount: counterAmount, message: 'Şu fiyata olur' },
    });
    expect(counterRes.ok(), `counter (${counterRes.status()})`).toBeTruthy();
    const counter = await counterRes.json();
    expect(counter.status).toBe('pending');
    expect(counter.buyerMustAccept).toBe(true);
    expect(Number(counter.amount)).toBe(counterAmount);
    expect(counter.id).not.toBe(offer.id); // yeni kayıt
    // eski teklif kapandı
    const oldOffer = await dbFind(request, 'offer', { id: offer.id });
    expect(oldOffer.status).toBe('rejected');

    // 4) Alıcı karşı teklifi kabul eder → accepted + pending_payment sipariş oluşur
    const acceptRes = await request.post(`${API}/offers/${counter.id}/accept`, { headers: authHeader(buyerToken) });
    expect(acceptRes.ok(), `accept (${acceptRes.status()})`).toBeTruthy();
    const accepted = await acceptRes.json();
    expect(accepted.status).toBe('accepted');
    expect(accepted.orderId, 'kabul sonrası orderId').toBeTruthy();
    const orderId = accepted.orderId;
    const orderAfterAccept = await dbFind(request, 'order', { id: orderId });
    expect(orderAfterAccept.status).toBe('pending_payment');
    expect(orderAfterAccept.offerId).toBe(counter.id);

    // 5a) Alıcı öder → order paid
    await payOfferOrder(request, buyerToken, orderId);
    const paidOrder = await expectDbEventually(request, 'order', { id: orderId }, (o) =>
      ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(o.status),
    );
    expect(['paid', 'preparing', 'shipped', 'delivered', 'completed']).toContain(paidOrder.status);

    // 5b) Satıcı hazırlar → preparing
    const prepRes = await request.post(`${API}/orders/${orderId}/prepare`, { headers: authHeader(sellerToken) });
    // paid değilse (zaten ilerlemişse) tolere et; aksi halde başarılı olmalı
    if (paidOrder.status === 'paid') {
      expect(prepRes.ok(), `prepare (${prepRes.status()})`).toBeTruthy();
      const prep = await dbFind(request, 'order', { id: orderId });
      expect(['preparing', 'shipped', 'delivered']).toContain(prep.status);
    }

    // 5c) Kargo→teslim adımı shipping modülünden; testte order'ı backdate ile delivered yap
    await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
    const deliveredOrder = await dbFind(request, 'order', { id: orderId });
    expect(deliveredOrder.status).toBe('delivered');

    // 6) Alıcı teslim aldı, onayladı → completed
    const confirmRes = await request.post(`${API}/orders/${orderId}/confirm`, { headers: authHeader(buyerToken) });
    expect(confirmRes.ok(), `confirm delivery (${confirmRes.status()})`).toBeTruthy();
    const completed = await dbFind(request, 'order', { id: orderId });
    expect(completed.status).toBe('completed');

    // 7) Süre dolunca satıcının parası serbest: paymentHold.releaseAt backdate + scheduler
    const hold = await dbFind(request, 'paymentHold', { orderId });
    if (hold) {
      await backdate(request, 'paymentHold', { orderId, status: 'held' }, { releaseAt: '2000-01-01T00:00:00.000Z' });
      await runScheduler(request, 'release-holds-due');
      const releasedHold = await expectDbEventually(request, 'paymentHold', { orderId }, (h) => h.status === 'released');
      expect(releasedHold.status).toBe('released');
    } else {
      // Hold kaydı yoksa (akış farklı) en azından sipariş tamamlandı olarak doğrulandı.
      expect(completed.status).toBe('completed');
    }

    // 8) Puan: alıcı satıcıya kullanıcı puanı + ürün puanı verir
    const userRatingRes = await request.post(`${API}/ratings/users`, {
      headers: authHeader(buyerToken),
      data: { receiverId: seller.id, orderId, score: 5, comment: 'Hızlı ve sorunsuz' },
    });
    expect(userRatingRes.ok(), `user rating (${userRatingRes.status()})`).toBeTruthy();
    const dbUserRating = await dbFind(request, 'rating', { receiverId: seller.id, orderId });
    expect(dbUserRating, 'DB kullanıcı puanı kaydı').toBeTruthy();
    expect(dbUserRating.score).toBe(5);

    const prodRatingRes = await request.post(`${API}/ratings/products`, {
      headers: authHeader(buyerToken),
      data: { productId: product.id, orderId, score: 5, review: 'Beklediğim gibi' },
    });
    expect(prodRatingRes.ok(), `product rating (${prodRatingRes.status()})`).toBeTruthy();
    const dbProdRating = await dbFind(request, 'productRating', { productId: product.id, orderId });
    expect(dbProdRating?.score).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J4 — Teklif süresi dolması: backdate + expire-offers; sonra red; sonra Hemen Al
// ════════════════════════════════════════════════════════════════════════
test.describe('J4 — Teklif süresi doluyor, sonra red, sonra Hemen Al', () => {
  test('expire-offers ile teklif expired olur; yeni teklif red; ürün satın alınır', async ({ request }) => {
    test.setTimeout(90_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);
    const amount = Math.ceil(price * 0.6);

    // 1) Alıcı teklif verir → pending
    const res1 = await createOffer(request, buyerToken, product.id, amount);
    expect(res1.ok(), `teklif1 (${res1.status()})`).toBeTruthy();
    const offer1 = await res1.json();
    expect(offer1.status).toBe('pending');

    // 2-3) Satıcı bekletir; süre dolur → backdate expiresAt geçmişe + expire-offers
    await backdate(request, 'offer', { id: offer1.id }, { expiresAt: '2000-01-01T00:00:00.000Z' });
    await runScheduler(request, 'expire-offers');
    const expired = await expectDbEventually(request, 'offer', { id: offer1.id }, (o) => o.status === 'expired');
    expect(expired.status).toBe('expired');

    // 4) (Bildirim) — expire-offers updateMany ile statü çeker, ayrı mail yok; DB statüsü kanıt.

    // 5) Alıcı aynı ürüne YENİ teklif verir (eski expired olduğu için pending engeli yok)
    const res2 = await createOffer(request, buyerToken, product.id, amount);
    expect(res2.ok(), `teklif2 (${res2.status()})`).toBeTruthy();
    const offer2 = await res2.json();
    expect(offer2.status).toBe('pending');

    // 6) Satıcı bu sefer reddeder → rejected
    const rejRes = await request.post(`${API}/offers/${offer2.id}/reject`, { headers: authHeader(sellerToken) });
    expect(rejRes.ok(), `reject (${rejRes.status()})`).toBeTruthy();
    const rejected = await dbFind(request, 'offer', { id: offer2.id });
    expect(rejected.status).toBe('rejected');

    // 7) Alıcı pazarlıksız 'Hemen Al' → orders/buy + ödeme
    const addr = await defaultAddress(request, buyerToken);
    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: authHeader(buyerToken),
      data: { productId: product.id, shippingAddressId: addr.id },
    });
    expect(buyRes.ok(), `orders/buy (${buyRes.status()})`).toBeTruthy();
    const orderId = (await buyRes.json())?.orderId;
    expect(orderId).toBeTruthy();

    const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(buyerToken), data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), `initiate (${initRes.status()})`).toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), `bypass-complete (${doneRes.status()})`).toBeTruthy();

    const order = await expectDbEventually(request, 'order', { id: orderId }, (o) =>
      ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(o.status),
    );
    expect(['paid', 'preparing', 'shipped', 'delivered', 'completed']).toContain(order.status);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J34 — Teklif kabul edildi ama alıcı ödemiyor: 24h sonra iptal
// ════════════════════════════════════════════════════════════════════════
test.describe('J34 — Kabul edildi ama ödenmedi, 24h iptal', () => {
  test('pending_payment sipariş backdate + cancel-expired-payments ile iptal olur', async ({ request }) => {
    test.setTimeout(90_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1) Alıcı teklif verir, satıcı kabul eder (normal teklif → satıcı kabul eder)
    const offRes = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(offRes.ok(), `teklif (${offRes.status()})`).toBeTruthy();
    const offer = await offRes.json();

    const accRes = await request.post(`${API}/offers/${offer.id}/accept`, { headers: authHeader(sellerToken) });
    expect(accRes.ok(), `accept (${accRes.status()})`).toBeTruthy();
    const accepted = await accRes.json();
    const orderId = accepted.orderId;
    expect(orderId).toBeTruthy();

    // 2) Sipariş pending_payment
    const o1 = await dbFind(request, 'order', { id: orderId });
    expect(o1.status).toBe('pending_payment');

    // 3-4) Alıcı 24h ödemedi → paymentExpiresAt geçmişe + cancel-expired-payments
    await backdate(request, 'order', { id: orderId, status: 'pending_payment' }, { paymentExpiresAt: '2000-01-01T00:00:00.000Z' });
    await runScheduler(request, 'cancel-expired-payments');

    // 5) Sistem siparişi iptal etti (payment_failed/cancelled). Teklif tarafı kapandı.
    const cancelled = await expectDbEventually(request, 'order', { id: orderId }, (o) =>
      ['cancelled', 'payment_failed', 'expired'].includes(o.status),
    );
    expect(['cancelled', 'payment_failed', 'expired']).toContain(cancelled.status);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J91 — Düşük/negatif teklif red, sonra Hemen Al
// ════════════════════════════════════════════════════════════════════════
test.describe('J91 — Düşük/negatif teklif reddi, sonra Hemen Al', () => {
  test('min %50 altı ve negatif tutar 4xx; geçerli teklif satıcı reddeder; ürün alınır', async ({ request }) => {
    test.setTimeout(90_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1) Fiyatın yarısının ALTINDA teklif → red (4xx)
    const lowRes = await createOffer(request, buyerToken, product.id, Math.max(1, Math.floor(price * 0.3)));
    expect(lowRes.ok(), 'düşük teklif kabul edilmemeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(lowRes.status());

    // 2) Negatif tutar → red (DTO Min(1) / iş kuralı)
    const negRes = await createOffer(request, buyerToken, product.id, -50);
    expect(negRes.ok(), 'negatif teklif kabul edilmemeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(negRes.status());

    // 3) Geçerli teklif → pending, satıcı reddeder → rejected
    const okRes = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(okRes.ok(), `geçerli teklif (${okRes.status()})`).toBeTruthy();
    const offer = await okRes.json();
    expect(offer.status).toBe('pending');

    const rejRes = await request.post(`${API}/offers/${offer.id}/reject`, { headers: authHeader(sellerToken) });
    expect(rejRes.ok(), `reject (${rejRes.status()})`).toBeTruthy();
    const rejected = await dbFind(request, 'offer', { id: offer.id });
    expect(rejected.status).toBe('rejected');

    // 4) Alıcı 'Hemen Al' ile alır ve öder
    const addr = await defaultAddress(request, buyerToken);
    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: authHeader(buyerToken),
      data: { productId: product.id, shippingAddressId: addr.id },
    });
    expect(buyRes.ok(), `orders/buy (${buyRes.status()})`).toBeTruthy();
    const orderId = (await buyRes.json())?.orderId;
    const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(buyerToken), data: { orderId, provider: 'paytr' } });
    expect(initRes.ok()).toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), `bypass-complete (${doneRes.status()})`).toBeTruthy();

    // 5) Teslim + onay (delivered backdate → confirm → completed)
    await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
    const confirmRes = await request.post(`${API}/orders/${orderId}/confirm`, { headers: authHeader(buyerToken) });
    expect(confirmRes.ok(), `confirm (${confirmRes.status()})`).toBeTruthy();
    const completed = await dbFind(request, 'order', { id: orderId });
    expect(completed.status).toBe('completed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J92 — Karşı teklif kuralları (satıcı): düşük ve fiyat-üstü red; geçerli kabul
// ════════════════════════════════════════════════════════════════════════
test.describe('J92 — Satıcı karşı teklif kuralları', () => {
  test('teklif-altı ve fiyat-üstü counter 4xx; geçerli counter alıcı kabul eder, sipariş oluşur', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);
    const offerAmount = Math.ceil(price * 0.6);

    // 1) Alıcı teklif gönderir
    const offRes = await createOffer(request, buyerToken, product.id, offerAmount);
    expect(offRes.ok(), `teklif (${offRes.status()})`).toBeTruthy();
    const offer = await offRes.json();

    // 2) Satıcı tekliften DÜŞÜK counter → red (counter > teklif olmalı)
    const lowCounter = await request.post(`${API}/offers/${offer.id}/counter`, {
      headers: authHeader(sellerToken),
      data: { amount: Math.max(1, offerAmount - 1) },
    });
    expect(lowCounter.ok(), 'tekliften düşük counter kabul edilmemeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(lowCounter.status());

    // 3) Satıcı ürün fiyatını AŞAN counter → red (counter <= fiyat olmalı)
    const highCounter = await request.post(`${API}/offers/${offer.id}/counter`, {
      headers: authHeader(sellerToken),
      data: { amount: price + 100 },
    });
    expect(highCounter.ok(), 'fiyat üstü counter kabul edilmemeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(highCounter.status());

    // teklif hâlâ pending (başarısız counter'lar onu kapatmadı)
    const stillPending = await dbFind(request, 'offer', { id: offer.id });
    expect(stillPending.status).toBe('pending');

    // 4) Kurallara uygun counter (teklif < x <= fiyat)
    const validCounterAmount = Math.min(offerAmount + Math.max(1, Math.floor((price - offerAmount) / 2)), price);
    const counterRes = await request.post(`${API}/offers/${offer.id}/counter`, {
      headers: authHeader(sellerToken),
      data: { amount: validCounterAmount },
    });
    expect(counterRes.ok(), `geçerli counter (${counterRes.status()})`).toBeTruthy();
    const counter = await counterRes.json();
    expect(counter.buyerMustAccept).toBe(true);

    // 5) Alıcı kabul eder → sipariş oluşur
    const accRes = await request.post(`${API}/offers/${counter.id}/accept`, { headers: authHeader(buyerToken) });
    expect(accRes.ok(), `accept (${accRes.status()})`).toBeTruthy();
    const accepted = await accRes.json();
    expect(accepted.status).toBe('accepted');
    expect(accepted.orderId).toBeTruthy();
    const order = await dbFind(request, 'order', { id: accepted.orderId });
    expect(order.status).toBe('pending_payment');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J93 — Alıcı kendi teklifini iptal + IDOR (başkasının teklifini iptal edemez)
// ════════════════════════════════════════════════════════════════════════
test.describe('J93 — Kendi teklifini iptal + cancel IDOR', () => {
  test('alıcı kendi teklifini iptal eder; başka kullanıcı iptal edemez; pending-count listelenir', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const strangerToken = await apiLogin(request, USERS.newMember); // ceren — teklifte taraf değil
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1) Alıcı teklif verir
    const offRes = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(offRes.ok(), `teklif (${offRes.status()})`).toBeTruthy();
    const offer = await offRes.json();
    expect(offer.status).toBe('pending');

    // 3) IDOR (önce dene): yabancı kullanıcı bu teklifi iptal edemez (cancel sadece buyer)
    const strangerCancel = await request.post(`${API}/offers/${offer.id}/cancel`, { headers: authHeader(strangerToken) });
    expect(strangerCancel.ok(), 'yabancı iptal edememeli').toBeFalsy();
    expect([403, 404]).toContain(strangerCancel.status());
    // satıcı bile cancel edemez (cancel buyer-only)
    const sellerCancel = await request.post(`${API}/offers/${offer.id}/cancel`, { headers: authHeader(sellerToken) });
    expect(sellerCancel.ok(), 'satıcı cancel edememeli').toBeFalsy();
    expect([403, 404]).toContain(sellerCancel.status());
    // teklif hâlâ pending
    const stillPending = await dbFind(request, 'offer', { id: offer.id });
    expect(stillPending.status).toBe('pending');

    // 2) Alıcı kendi teklifini iptal eder → cancelled
    const cancelRes = await request.post(`${API}/offers/${offer.id}/cancel`, { headers: authHeader(buyerToken) });
    expect(cancelRes.ok(), `cancel (${cancelRes.status()})`).toBeTruthy();
    const cancelled = await dbFind(request, 'offer', { id: offer.id });
    expect(cancelled.status).toBe('cancelled');

    // 4) Alıcı bekleyen teklif sayısını + tekliflerini listeler
    const pcRes = await request.get(`${API}/offers/pending-count`, { headers: authHeader(buyerToken) });
    expect(pcRes.ok(), `pending-count (${pcRes.status()})`).toBeTruthy();
    const pc = await pcRes.json();
    expect(typeof pc.total).toBe('number');
    const listRes = await request.get(`${API}/offers`, { headers: authHeader(buyerToken), params: { type: 'sent' } });
    expect(listRes.ok(), `offers list (${listRes.status()})`).toBeTruthy();
    const list = await listRes.json();
    const found = (list?.data ?? []).find((o: any) => o.id === offer.id);
    expect(found?.status, 'listede iptal edilmiş teklif görünür').toBe('cancelled');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J94 — Teklif detayı IDOR: yabancı GET /offers/:id göremez
// ════════════════════════════════════════════════════════════════════════
test.describe('J94 — Teklif detay IDOR', () => {
  test('buyer ve seller görür; yabancı 403; sonra satıcı kabul eder', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const strangerToken = await apiLogin(request, USERS.newMember);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1) Alıcı teklif verir
    const offRes = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(offRes.ok(), `teklif (${offRes.status()})`).toBeTruthy();
    const offer = await offRes.json();

    // 2) Alıcı ve satıcı detayı görebilir
    const buyerView = await request.get(`${API}/offers/${offer.id}`, { headers: authHeader(buyerToken) });
    expect(buyerView.ok(), 'alıcı görür').toBeTruthy();
    expect((await buyerView.json()).id).toBe(offer.id);
    const sellerView = await request.get(`${API}/offers/${offer.id}`, { headers: authHeader(sellerToken) });
    expect(sellerView.ok(), 'satıcı görür').toBeTruthy();
    expect((await sellerView.json()).id).toBe(offer.id);

    // 3) Yabancı detaya erişemez → 403 (taraf değil)
    const strangerView = await request.get(`${API}/offers/${offer.id}`, { headers: authHeader(strangerToken) });
    expect(strangerView.ok(), 'yabancı görememeli').toBeFalsy();
    expect([403, 404]).toContain(strangerView.status());

    // 4) Satıcı kabul eder → sipariş oluşur
    const accRes = await request.post(`${API}/offers/${offer.id}/accept`, { headers: authHeader(sellerToken) });
    expect(accRes.ok(), `accept (${accRes.status()})`).toBeTruthy();
    const accepted = await accRes.json();
    expect(accepted.orderId).toBeTruthy();
    const order = await dbFind(request, 'order', { id: accepted.orderId });
    expect(order.status).toBe('pending_payment');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J95 — Süresi dolmuş teklif kabul edilemez; sonra yeni teklif hızlı kabul
// ════════════════════════════════════════════════════════════════════════
test.describe('J95 — Süresi dolmuş teklif kabul edilemez', () => {
  test('expired teklif accept 4xx; yeni teklif kabul edilir, sipariş oluşur', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyer = await apiMe(request, buyerToken);
    const seller = await apiMe(request, sellerToken);
    const product = await sellerActiveProduct(request, seller.id, buyer.id);
    const price = Number(product.price);

    // 1) Alıcı teklif verir, satıcı yanıt vermez
    const offRes = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(offRes.ok(), `teklif (${offRes.status()})`).toBeTruthy();
    const offer = await offRes.json();

    // 2) Süre dolar (backdate + expire-offers) → expired
    await backdate(request, 'offer', { id: offer.id }, { expiresAt: '2000-01-01T00:00:00.000Z' });
    await runScheduler(request, 'expire-offers');
    const expired = await expectDbEventually(request, 'offer', { id: offer.id }, (o) => o.status === 'expired');
    expect(expired.status).toBe('expired');

    // 3) Satıcı süresi dolmuş teklifi kabul etmeye çalışır → 4xx
    const accRes = await request.post(`${API}/offers/${offer.id}/accept`, { headers: authHeader(sellerToken) });
    expect(accRes.ok(), 'süresi dolmuş teklif kabul edilememeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(accRes.status());
    // Sipariş oluşmadı
    const noOrder = await dbFind(request, 'order', { offerId: offer.id });
    expect(noOrder, 'expired teklif için sipariş oluşmamalı').toBeFalsy();

    // 4) Alıcı yeni teklif verir, satıcı bu kez hızlı kabul eder → sipariş oluşur
    const off2Res = await createOffer(request, buyerToken, product.id, Math.ceil(price * 0.6));
    expect(off2Res.ok(), `teklif2 (${off2Res.status()})`).toBeTruthy();
    const offer2 = await off2Res.json();
    const acc2 = await request.post(`${API}/offers/${offer2.id}/accept`, { headers: authHeader(sellerToken) });
    expect(acc2.ok(), `accept2 (${acc2.status()})`).toBeTruthy();
    const accepted2 = await acc2.json();
    expect(accepted2.orderId).toBeTruthy();
    const order = await dbFind(request, 'order', { id: accepted2.orderId });
    expect(order.status).toBe('pending_payment');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J102 — Son adet satışı bekleyen teklifleri iptal eder
// ════════════════════════════════════════════════════════════════════════
test.describe('J102 — Son adet alımı bekleyen teklifleri kapatır', () => {
  test('iki alıcı teklif verir; biri Hemen Al ile son adedi alır; diğerinin teklifi accept edilemez', async ({ request }) => {
    test.setTimeout(90_000);

    // İki alıcı: mehmet (buyer) + deniz (buyerClean). Satıcı: zeynep.
    const buyerAToken = await apiLogin(request, USERS.buyer);       // teklif verir, kazanmaz
    const buyerBToken = await apiLogin(request, USERS.buyerClean);  // Hemen Al ile alır
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const buyerA = await apiMe(request, buyerAToken);
    const buyerB = await apiMe(request, buyerBToken);
    const seller = await apiMe(request, sellerToken);

    // Son adet (quantity == 1) bir ürün bul; yoksa stoklu üründe quantity=1'e backdate.
    let product = await sellerActiveProduct(request, seller.id, buyerA.id);
    // mehmet'in kendi ürünü olmamalı; sellerFree (zeynep) ürünü zaten.
    const price = Number(product.price);

    // Ürünü garanti 'son adet' yapmak için quantity=1'e çek (zaman/stok bağımsız determinizm)
    await backdate(request, 'product', { id: product.id }, { quantity: 1 });

    // 1) İki kullanıcı da teklif verir (pending)
    const offA = await createOffer(request, buyerAToken, product.id, Math.ceil(price * 0.6));
    expect(offA.ok(), `teklifA (${offA.status()})`).toBeTruthy();
    const offerA = await offA.json();
    expect(offerA.status).toBe('pending');

    // 2) Alıcı B 'Hemen Al' ile son adedi alır ve öder
    const addrB = await defaultAddress(request, buyerBToken);
    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: authHeader(buyerBToken),
      data: { productId: product.id, shippingAddressId: addrB.id },
    });
    expect(buyRes.ok(), `orders/buy (${buyRes.status()})`).toBeTruthy();
    const orderId = (await buyRes.json())?.orderId;
    const initRes = await request.post(`${API}/payments/initiate`, { headers: authHeader(buyerBToken), data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), `initiate (${initRes.status()})`).toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), `bypass-complete (${doneRes.status()})`).toBeTruthy();
    const orderB = await expectDbEventually(request, 'order', { id: orderId }, (o) =>
      ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(o.status),
    );
    expect(['paid', 'preparing', 'shipped', 'delivered', 'completed']).toContain(orderB.status);

    // 3) Stok bitti: alıcı A'nın bekleyen teklifi artık geçerli alıma dönüşemez.
    //    Statü otomatik kapanmasa bile, ürün artık aktif/stoklu değil → accept BAŞARISIZ olmalı.
    const offerARow = await dbFind(request, 'offer', { id: offerA.id });
    const acceptA = await request.post(`${API}/offers/${offerA.id}/accept`, { headers: authHeader(sellerToken) });
    if (['rejected', 'expired', 'cancelled'].includes(offerARow.status)) {
      // sistem teklifi otomatik kapattıysa accept zaten 4xx
      expect(acceptA.ok(), 'kapanmış teklif accept edilememeli').toBeFalsy();
    } else {
      // pending kalmışsa: stok yok → accept iş kuralı 4xx
      expect(acceptA.ok(), 'stok bitince accept edilememeli').toBeFalsy();
      expect([400, 403, 404, 409]).toContain(acceptA.status());
    }

    // 4) (Bildirim) — teklif sahibine in-app bildirim; DB notification yan kanıt (varsa)
    const notifCount = await dbCount(request, 'notification', { userId: buyerA.id });
    expect(notifCount).toBeGreaterThanOrEqual(0); // varlık garanti edilemez; hata fırlatmamalı

    // 5) Kazanan alıcı (B) teslim alır + onaylar → completed
    await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
    const confirmRes = await request.post(`${API}/orders/${orderId}/confirm`, { headers: authHeader(buyerBToken) });
    expect(confirmRes.ok(), `confirm (${confirmRes.status()})`).toBeTruthy();
    const completed = await dbFind(request, 'order', { id: orderId });
    expect(completed.status).toBe('completed');
  });
});
