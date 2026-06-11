/**
 * J88 — Webhook güvenliği: yanlış anahtar reddediliyor
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

test.describe('J88 — Webhook güvenliği: yanlış anahtar reddediliyor', () => {
  test('anahtarsız ve yanlış anahtarlı bildirim reddedilir, doğru anahtarla ilerler', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al + initiate (pending)
    const { orderId, paymentId, amount } = await buyAndInitiate(request, buyerToken, product.id);
    const totalKurus = Math.round(amount * 100);

    // 2) Anahtarsız (hash eksik) bildirim -> handler OK döner, işlenmez
    const noHash = { merchant_oid: orderId, status: 'success', total_amount: String(totalKurus) };
    const r1 = await request.post(`${API}/payments/callback/paytr`, { form: noHash });
    expect(r1.ok(), 'hash eksik -> 200 ama işlenmez').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status, 'hash eksik sonrası').toBe('pending');

    // 3) Yanlış anahtarlı imza (farklı merchant key) -> hash mismatch, işlenmez
    const wrongKey = signPaytrCallback(orderId, 'success', totalKurus, 'YANLIS-KEY', 'YANLIS-SALT');
    const r2 = await request.post(`${API}/payments/callback/paytr`, { form: wrongKey });
    expect(r2.ok(), 'yanlış anahtar -> 200 ama işlenmez').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status, 'yanlış anahtar sonrası').toBe('pending');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('pending_payment');

    // 4) Doğru anahtarlı (test-key/test-salt) geçerli bildirim -> sipariş ilerler
    const validCb = signPaytrCallback(orderId, 'success', totalKurus, PAYTR_KEY, PAYTR_SALT);
    const r3 = await request.post(`${API}/payments/callback/paytr`, { form: validCb });
    expect(r3.ok(), 'doğru anahtar -> işlenir').toBeTruthy();
    // Callback 200 döndükten sonra completion async commit olabiliyor → poll (yarışı önle).
    const _pay = await expectDbEventually(request, 'payment', { id: paymentId }, (p) => p.status === 'completed');
    expect(_pay.status, 'geçerli bildirim sonrası').toBe('completed');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toMatch(/paid|preparing/);

    // 5) Akış tamamlanır
    const sellerToken = await tokenForSeller(request, (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId);
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
