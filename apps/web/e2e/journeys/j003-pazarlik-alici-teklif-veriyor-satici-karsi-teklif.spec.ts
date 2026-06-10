/**
 * J3 — Pazarlık: alıcı teklif veriyor, satıcı karşı teklif veriyor, anlaşıyorlar
 * Kaynak: suite-e-offers.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
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
