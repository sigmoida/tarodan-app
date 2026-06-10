/**
 * J25 — Misafir üye olmadan alışveriş yapıyor
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
  expect(prep.ok(), 'satıcı hazırlıyor (paid->preparing)').toBeTruthy();
  // preparing -> delivered (kargo modülü tarayıcıdan sürülemez; backdate ile durum ilerletilir)
  await backdate(request, 'order', { id: orderId }, { status: 'delivered', deliveredAt: new Date().toISOString() });
  // delivered -> completed (alıcı teslim onayı)
  const confirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken) });
  expect(confirm.ok(), 'alıcı teslim onayı (delivered->completed)').toBeTruthy();
}

// ───────────────────────────── J11 — Ödeme timeout, geri dönüp ödeme ─────────────────────────────

test.describe('J25 — Misafir üye olmadan alışveriş yapıyor', () => {
  test('misafir OTP doğrular, sipariş oluşur, ödenir', async ({ request }) => {
    test.setTimeout(60_000);
    // Satın alınabilir bir ürün bul (alıcı kısıtı yok; misafir)
    const product = await apiFirstBuyableProduct(request);

    const guestEmail = `guest-${Date.now()}@test.local`;
    await clearMailbox(request);

    // 1) Misafir checkout e-posta OTP iste
    const sendCode = await request.post(`${API}/orders/guest/send-verification-code`, { data: { email: guestEmail } });
    expect(sendCode.ok(), 'OTP gönderildi').toBeTruthy();

    // 2) GERÇEK Mailhog'dan 6 haneli kodu oku
    const mail = await getLastEmailTo(request, guestEmail, 20_000);
    expect(mail.subject, 'doğrulama maili').toMatch(/doğrulama|verification/i);
    const code = extractCode(mail.body, 6);
    expect(code, 'maildeki 6 haneli kod').toBeTruthy();

    // 3) Misafir checkout (teslimat bilgileri + kod)
    const guestRes = await request.post(`${API}/orders/guest`, {
      data: {
        productId: product.id,
        email: guestEmail,
        emailVerificationCode: code,
        phone: '+905551234567',
        guestName: 'Misafir Alici',
        shippingAddress: {
          fullName: 'Misafir Alici',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Caferağa Mah. Moda Cad. No:1',
          zipCode: '34710',
        },
      },
    });
    expect(guestRes.ok(), 'misafir sipariş oluştu').toBeTruthy();
    const guestBody = await guestRes.json();
    const orderId = guestBody?.orderId ?? guestBody?.id ?? guestBody?.order?.id ?? guestBody?.data?.id;
    expect(orderId, 'misafir orderId').toBeTruthy();

    // DB doğrulama: sipariş gerçekten oluştu, ödeme bekliyor
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { status: true, totalAmount: true });
    expect(dbOrder, 'sipariş DB kaydı').toBeTruthy();
    expect(dbOrder.status).toBe('pending_payment');

    // 4) Misafir öder (initiate-guest -> bypass-complete)
    const initRes = await request.post(`${API}/payments/initiate-guest`, { data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), 'misafir initiate').toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    expect(paymentId).toBeTruthy();
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'misafir bypass-complete').toBeTruthy();

    // Sonuç: sipariş ödendi + ödeme completed (DB)
    const paidOrder = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(['paid', 'preparing']).toContain(paidOrder.status);
    const pay = await dbFind(request, 'payment', { orderId }, { status: true });
    expect(pay.status, 'misafir ödeme tamamlandı').toBe('completed');
  });
});
