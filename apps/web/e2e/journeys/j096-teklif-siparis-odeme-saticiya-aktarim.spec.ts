/**
 * J96 — Teklif → sipariş → ödeme → satıcıya aktarım
 * Kaynak: suite-d-payment.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE D — Satın alma & Ödeme journeyleri (J11, J25, J63, J64, J69, J70, J71,
 * J74, J75, J28, J29, J88, J96).
 *
 * Gerçek backend + tarodan_test DB + gerçek Mailhog. Ödeme PAYMENT_BYPASS=true ile
 * tamamlanır (gerçek PayTR yerine bypass-complete). Webhook journeyleri (J28/J29/J88)
 * gerçek /payments/callback/paytr handler'ını çağırır; imza .env.test'teki
 * PAYTR_MERCHANT_KEY=test-key / SALT=test-salt ile üretilir.
 *
 * Endpointler controller'lardan birebir doğrulandı:
 *   - order.controller.ts: POST /orders/buy, POST /orders/:id/prepare (paid->preparing),
 *     POST /orders/:id/confirm (delivered->completed, buyer only), PATCH /orders/:id/shipping-address
 *   - payment.controller.ts: POST /payments/initiate, POST /payments/:id/bypass-complete,
 *     POST /payments/:id/cancel (pending, owner), POST /payments/:id/confirm-failed,
 *     POST /payments/callback/paytr (@Public webhook)
 *   - offer.controller.ts: POST /offers, POST /offers/:id/accept (order auto-create)
 *
 * Dev-hook / backdate gerektiren adımlar (tarayıcıdan sürülemez):
 *   - J11: payment.createdAt backdate + cancel-expired-payments scheduler
 *   - J64/J63/J96: order.status='delivered' backdate (kargo modülü yerine) -> confirmDelivery
 *   - J75/J96: paymentHold.releaseAt backdate + release-holds-due scheduler
 *
 * NOT: PayTR callback'i merchant_oid olarak orderId kullanır. Bypass modunda
 * initiate, providerConversationId üretmez; findPaymentForPaytrCallback
 * OR:[{providerConversationId},{orderId}] ile orderId üzerinden eşleşir.
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API,
  USERS,
  loginViaToken,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
  apiDefaultAddressId,
  signPaytrCallback,
} from '../support/helpers';
import { dbFind, dbCount, backdate, runScheduler, expectDbEventually } from '../support/db';
import { tokenForSeller } from '../support/journeys-extra';
import { getLastEmailTo, extractCode, clearMailbox } from '../support/mail';

// .env.test'teki gerçek PayTR test anahtarları (playwright webServer NODE_ENV=test -> .env.test).
const PAYTR_KEY = 'test-key';
const PAYTR_SALT = 'test-salt';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** orders/buy yap, ödenmemiş (pending_payment) sipariş + initiate edilmiş payment döndür. */
async function buyAndInitiate(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<{ orderId: string; paymentId: string; amount: number }> {
  const shippingAddressId = await apiDefaultAddressId(request, token);
  const buyRes = await request.post(`${API}/orders/buy`, { headers: auth(token), data: { productId, shippingAddressId } });
  expect(buyRes.ok(), 'orders/buy').toBeTruthy();
  const orderId = (await buyRes.json())?.orderId;
  expect(orderId, 'orderId').toBeTruthy();

  const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(token), data: { orderId, provider: 'paytr' } });
  expect(initRes.ok(), 'payments/initiate').toBeTruthy();
  const initBody = await initRes.json();
  const paymentId = initBody?.paymentId;
  expect(paymentId, 'paymentId').toBeTruthy();
  const amount = Number(initBody?.amount ?? 0);
  return { orderId, paymentId, amount };
}

/** Sipariş paid -> completed: prepare + delivered backdate + buyer confirm. Hold serbest bırakılmaz. */
async function driveToCompleted(request: APIRequestContext, buyerToken: string, sellerToken: string, orderId: string) {
  // paid -> preparing (satıcı)
  const prep = await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) });
  // preparing -> delivered (kargo modülü tarayıcıdan sürülemez; backdate ile durum ilerletilir)
  await backdate(request, 'order', { id: orderId }, { status: 'delivered', deliveredAt: new Date().toISOString() });
  // delivered -> completed (alıcı teslim onayı)
  const confirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken) });
  expect(confirm.ok(), 'alıcı teslim onayı (delivered->completed)').toBeTruthy();
}

// ───────────────────────────── J11 — Ödeme timeout, geri dönüp ödeme ─────────────────────────────

test.describe('J96 — Teklif → sipariş → ödeme → satıcıya aktarım', () => {
  test('teklif kabul edilir, sipariş oluşur, ödenir, hold süre sonunda serbest', async ({ page, request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı teklif verdi (ürün fiyatının en az %50'si). Teklif = fiyat (kabul kesin).
    //    Üründe alıcının önceki bekleyen teklifi varsa iptal et (state-leak'e karşı dayanıklı).
    const offerAmount = Number(product.price);
    const existing = await dbFind(request, 'offer', { buyerId: me.id, productId: product.id, status: 'pending' }, { id: true } as any);
    if (existing?.id) await request.post(`${API}/offers/${existing.id}/cancel`, { headers: auth(buyerToken) }).catch(() => {});
    const offerRes = await request.post(`${API}/offers`, {
      headers: auth(buyerToken),
      data: { productId: product.id, amount: offerAmount, message: 'Bu fiyata alabilir miyim?' },
    });
    if (!offerRes.ok()) expect(offerRes.ok(), `teklif oluştu (${offerRes.status()}) ${(await offerRes.text()).slice(0, 100)}`).toBeTruthy();
    const offerId = (await offerRes.json())?.id;
    expect(offerId, 'offerId').toBeTruthy();

    // Satıcı kabul etti -> otomatik pending_payment sipariş oluşur
    const sellerToken = await tokenForSeller(request, product.sellerId);
    const acceptRes = await request.post(`${API}/offers/${offerId}/accept`, { headers: auth(sellerToken) });
    expect(acceptRes.ok(), 'teklif kabul').toBeTruthy();

    // 2) Otomatik oluşan siparişi offerId ile bul
    const order = await expectDbEventually(
      request,
      'order',
      { offerId },
      (o) => !!o?.id,
      8000,
    );
    const orderId = order.id;
    expect(order.status, 'teklif siparişi ödeme bekliyor').toBe('pending_payment');

    // Teklif siparişinde adres yok -> alıcı teslimat adresini ekler (PATCH /orders/:id/shipping-address)
    const addr = await request.patch(`${API}/orders/${orderId}/shipping-address`, {
      headers: auth(buyerToken),
      data: { fullName: 'Deniz Demo', phone: '+905551112233', city: 'İstanbul', district: 'Beşiktaş', address: 'Test Mah. 1. Sok No:5', zipCode: '34000' },
    });
    expect(addr.ok(), 'teslimat adresi eklendi').toBeTruthy();

    // 3) Alıcı ödedi -> para emanete (hold = held)
    const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), 'teklif siparişi initiate').toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'bypass-complete').toBeTruthy();
    const hold = await dbFind(request, 'paymentHold', { paymentId }, { status: true, sellerId: true });
    expect(hold, 'escrow hold').toBeTruthy();
    expect(hold.status).toBe('held');

    // 4) Satıcı hazırlar, kargolar (delivered backdate), alıcı onaylar -> completed
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');

    // 5) Süre dolunca para satıcıya aktarılır (releaseAt backdate + release-holds-due)
    await backdate(request, 'paymentHold', { paymentId }, { releaseAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    await runScheduler(request, 'release-holds-due');
    const released = await expectDbEventually(request, 'paymentHold', { paymentId }, (h) => h?.status === 'released', 8000);
    expect(released.status, 'hold satıcıya aktarıldı').toBe('released');

    // UI dogrulama: alıcı kendi tamamlanmış siparişini görebiliyor (token enjekte)
    await loginViaToken(page, buyerToken);
    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(/sayfa bulunamad|not found|404/i);
    expect(page.url()).toContain(`/orders/${orderId}`);
  });
});
