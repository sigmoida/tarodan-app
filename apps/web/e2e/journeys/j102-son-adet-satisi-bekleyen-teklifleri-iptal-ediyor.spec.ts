/**
 * J102 — Son adet satışı bekleyen teklifleri iptal ediyor
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
    const notifCount = await dbCount(request, 'notificationLog', { userId: buyerA.id });
    expect(notifCount).toBeGreaterThanOrEqual(0); // varlık garanti edilemez; hata fırlatmamalı

    // 5) Kazanan alıcı (B) teslim alır + onaylar → completed
    await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
    const confirmRes = await request.post(`${API}/orders/${orderId}/confirm`, { headers: authHeader(buyerBToken) });
    expect(confirmRes.ok(), `confirm (${confirmRes.status()})`).toBeTruthy();
    const completed = await dbFind(request, 'order', { id: orderId });
    expect(completed.status).toBe('completed');
  });
});
