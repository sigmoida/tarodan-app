/**
 * J11 — Ödeme süresi doluyor, kullanıcı geri dönüp ödüyor
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

test.describe('J11 — Ödeme süresi doluyor, kullanıcı geri dönüp ödüyor', () => {
  test('timeout payment iptal, sipariş yaşar, yeniden ödeme tamamlanır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al -> ödeme ekranı, ama ödenmedi (initiate edildi, bypass-complete YOK)
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    let pay = await dbFind(request, 'payment', { id: paymentId }, { status: true, createdAt: true });
    expect(pay.status).toBe('pending');

    // 2) 30 dk doldu -> payment.createdAt geçmişe çek + cancel-expired-payments
    await backdate(request, 'payment', { id: paymentId }, { createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString() });
    await runScheduler(request, 'cancel-expired-payments');

    // Sonuç: payment 'failed' (timeout); sipariş 24h split-window içinde 'pending_payment' yaşar
    pay = await dbFind(request, 'payment', { id: paymentId }, { status: true });
    expect(pay.status, 'timeout payment failed').toBe('failed');
    const order1 = await apiGetOrder(request, buyerToken, orderId);
    expect(order1.status, 'sipariş hâlâ ödeme bekliyor').toBe('pending_payment');

    // 3) Kullanıcı geri döndü, yeniden initiate + bu kez bypass ile öder
    const reInit = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    expect(reInit.ok(), 'yeniden initiate').toBeTruthy();
    const newPaymentId = (await reInit.json())?.paymentId;
    expect(newPaymentId).toBeTruthy();
    const done = await request.post(`${API}/payments/${newPaymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'bypass-complete').toBeTruthy();

    // Sonuç: sipariş ödendi
    const order2 = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing'], 'yeniden ödeme sonrası').toContain(order2.status);
    const newPay = await dbFind(request, 'payment', { id: newPaymentId }, { status: true });
    expect(newPay.status).toBe('completed');

    // 4) Satıcı hazırlar, kargolar (backdate delivered), alıcı onaylar -> completed
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const sellerMe = await apiMe(request, sellerToken);
    // ürünün satıcısı premium değilse hangi satıcıysa onu kullan (order detayı nested seller döndürebilir
    // → flat sellerId'i dbFind ile garanti al).
    const _sellerId = order2.sellerId ?? order2.seller?.id ?? (await dbFind(request, 'order', { id: orderId }, { sellerId: true }))?.sellerId;
    const ownerSellerToken = _sellerId === sellerMe.id ? sellerToken : await tokenForSeller(request, _sellerId);
    await driveToCompleted(request, buyerToken, ownerSellerToken, orderId);
    const final = await apiGetOrder(request, buyerToken, orderId);
    expect(final.status, 'sipariş tamamlandı').toBe('completed');
  });
});

/** Bir order'ın satıcısı için doğru seed token'ını bul (premium/business/free arasından). */
async function tokenForSeller(request: APIRequestContext, sellerId: string): Promise<string> {
  for (const u of [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree, USERS.buyer]) {
    const t = await apiLogin(request, u);
    const me = await apiMe(request, t);
    if (me.id === sellerId) return t;
  }
  throw new Error(`sellerId ${sellerId} için seed token bulunamadı`);
}
