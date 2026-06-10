/**
 * J91 — Alıcı düşük teklif veriyor, reddediliyor, sonra hemen alıyor
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
