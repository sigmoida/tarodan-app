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
    // ürünün satıcısı premium değilse hangi satıcıysa onu kullan
    const ownerSellerToken = order2.sellerId === sellerMe.id ? sellerToken : await tokenForSeller(request, order2.sellerId);
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

// ───────────────────────────── J25 — Misafir checkout ─────────────────────────────
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
    const orderId = guestBody?.orderId;
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

// ───────────────────────────── J63 — Ödemeden hazırlama engeli ─────────────────────────────
test.describe('J63 — Satıcı ödemeden hazırlamaya çalışıyor', () => {
  test('ödenmemiş sipariş prepare reddedilir, ödeme sonrası akış ilerler', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı sipariş oluşturdu (henüz ödemedi)
    const { orderId } = await buyAndInitiate(request, buyerToken, product.id);
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { status: true, sellerId: true });
    expect(dbOrder.status).toBe('pending_payment');

    // 2) Satıcı 'hazırlanıyor' yapmaya çalıştı -> reddedilir (ödenmemiş)
    const sellerToken = await tokenForSeller(request, dbOrder.sellerId);
    const earlyPrep = await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) });
    expect(earlyPrep.ok(), 'ödenmemiş prepare reddedilmeli').toBeFalsy();
    expect([400, 403, 409]).toContain(earlyPrep.status());
    // durum değişmedi
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('pending_payment');

    // 3) Alıcı ödedi
    const reInit = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    const pid = (await reInit.json())?.paymentId;
    await request.post(`${API}/payments/${pid}/bypass-complete`, { data: {} });
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toMatch(/paid|preparing/);

    // 4) Satıcı bu kez hazırlayıp kargolar (delivered backdate), alıcı onaylar -> completed
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J64 — Teslim onay IDOR ─────────────────────────────
test.describe('J64 — Alıcı olmayan teslimatı onaylayamıyor', () => {
  test('üçüncü kişi confirm reddedilir, gerçek alıcı onaylar', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı aldı + ödedi, satıcı kargoladı (delivered backdate)
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { sellerId: true });
    const sellerToken = await tokenForSeller(request, dbOrder.sellerId);
    await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) });
    await backdate(request, 'order', { id: orderId }, { status: 'delivered', deliveredAt: new Date().toISOString() });

    // 2) Üçüncü kişi (alıcı değil, satıcı değil) confirm dener -> 403/404
    const strangerToken = await apiLogin(request, USERS.newMember); // ceren
    const idor = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(strangerToken) });
    expect(idor.ok(), 'yabancı teslim onayı reddedilmeli').toBeFalsy();
    expect([403, 404]).toContain(idor.status());
    // durum hâlâ delivered (değişmedi)
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('delivered');

    // Satıcı da confirm edemez (buyer only) -> ekstra IDOR kontrolü
    const sellerConfirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(sellerToken) });
    expect(sellerConfirm.ok(), 'satıcı teslim onayı reddedilmeli').toBeFalsy();
    expect([403, 404]).toContain(sellerConfirm.status());

    // 3) Gerçek alıcı onaylar -> completed
    const ok = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken) });
    expect(ok.ok(), 'gerçek alıcı onayı').toBeTruthy();
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J69 — Ödeme iptali + rezervasyon serbest ─────────────────────────────
test.describe('J69 — Ödeme iptali ve rezervasyon serbest kalması', () => {
  test('alıcı pending ödemeyi iptal eder, başka alıcı aynı ürünü alır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al -> ürün rezerve, pending payment
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');

    // 2) Bekleyen ödemeyi iptal et -> payment failed + sipariş iptal (rezervasyon serbest)
    const cancel = await request.post(`${API}/payments/${paymentId}/cancel`, { headers: auth(buyerToken) });
    expect(cancel.ok(), 'ödeme iptali').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('failed');
    const cancelledOrder = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(cancelledOrder.status, 'iptal sonrası sipariş').toMatch(/cancelled|pending_payment/);

    // 3) Başka bir alıcı (mehmet) aynı ürünü hemen alıp öder -> rezervasyon serbest olduğu için başarılı
    const buyer2 = await apiLogin(request, USERS.buyer);
    const { orderId: order2Id } = await apiBuyAndPay(request, buyer2, product.id);
    const order2 = await dbFind(request, 'order', { id: order2Id }, { status: true });
    expect(['paid', 'preparing'], 'ikinci alıcı ödeyebildi').toContain(order2.status);

    // 4) İkinci alıcı teslim alır, onaylar -> completed
    const seller = await tokenForSeller(request, (await dbFind(request, 'order', { id: order2Id }, { sellerId: true })).sellerId);
    await driveToCompleted(request, buyer2, seller, order2Id);
    expect((await dbFind(request, 'order', { id: order2Id }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J70 — Başkasının ödemesini iptal IDOR ─────────────────────────────
test.describe('J70 — Başkasının ödemesini iptal etme engeli', () => {
  test('B, A nın ödemesini iptal edemez; A tamamlanmış ödemeyi iptal edemez', async ({ request }) => {
    test.setTimeout(60_000);
    // A = buyerClean (deniz), B = newMember (ceren)
    const tokenA = await apiLogin(request, USERS.buyerClean);
    const meA = await apiMe(request, tokenA);
    const product = await apiFirstBuyableProduct(request, meA.id);

    // 1) A ödeme başlattı (pending)
    const { orderId, paymentId } = await buyAndInitiate(request, tokenA, product.id);
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');

    // 2) B, A'nın ödemesini iptal etmeye çalıştı -> 403/404 (sahiplik kontrolü)
    const tokenB = await apiLogin(request, USERS.newMember);
    const idor = await request.post(`${API}/payments/${paymentId}/cancel`, { headers: auth(tokenB) });
    expect(idor.ok(), 'B A nın ödemesini iptal edememeli').toBeFalsy();
    expect([403, 404]).toContain(idor.status());
    // A'nın ödemesi hâlâ pending (B bozamadı)
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');

    // 3) A ödemesini tamamladı (bypass)
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'A öder').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');

    // 4) A tamamlanmış ödemeyi iptal etmeye çalıştı -> reddedilir (sadece pending iptal edilebilir)
    const lateCancel = await request.post(`${API}/payments/${paymentId}/cancel`, { headers: auth(tokenA) });
    expect(lateCancel.ok(), 'tamamlanmış ödeme iptal edilememeli').toBeFalsy();
    expect([400, 409]).toContain(lateCancel.status());
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J71 — Başarısız ödeme onayı ile rezervasyon iadesi ─────────────────────────────
test.describe('J71 — Başarısız ödeme onayı ile rezervasyon iadesi', () => {
  test('confirm-failed rezervasyonu serbest bırakır, başka alıcı ürünü alır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al, ödeme yapılamadı (pending)
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');

    // 2) Fail sayfasından 'başarısız' onayı -> rezervasyon serbest (confirm-failed, @Public)
    const failRes = await request.post(`${API}/payments/${paymentId}/confirm-failed`, { data: {} });
    expect(failRes.ok(), 'confirm-failed').toBeTruthy();
    expect((await failRes.json())?.released, 'rezervasyon serbest bırakıldı').toBe(true);
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('failed');

    // idempotent: ikinci kez çağrı released:false döner
    const failAgain = await request.post(`${API}/payments/${paymentId}/confirm-failed`, { data: {} });
    expect(failAgain.ok()).toBeTruthy();
    expect((await failAgain.json())?.released).toBe(false);

    // 3-4) Başka bir alıcı ürünü satın alır -> akış tamamlanır
    const buyer2 = await apiLogin(request, USERS.buyer);
    const { orderId: order2Id } = await apiBuyAndPay(request, buyer2, product.id);
    expect(['paid', 'preparing']).toContain((await dbFind(request, 'order', { id: order2Id }, { status: true })).status);
  });
});

// ───────────────────────────── J74 — Bypass idempotency 2x + üyelik bypass ─────────────────────────────
test.describe('J74 — Test ortamında ödeme bypass akışı', () => {
  test('bypass iki kez çağrılır ama durum bozulmaz, tek payment kalır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al + initiate
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);

    // 2) Bypass-complete (1. kez) -> tamamlandı
    const first = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(first.ok(), 'bypass 1').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');
    const orderAfter1 = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(['paid', 'preparing']).toContain(orderAfter1.status);

    // 3) Bypass-complete (2. kez) -> idempotent, durum bozulmaz
    const second = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(second.ok(), 'bypass 2 (idempotent)').toBeTruthy();
    // payment hâlâ completed, sipariş için TEK payment, TEK hold var (çift işlem yok)
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');
    expect(await dbCount(request, 'payment', { orderId }), 'sipariş için tek payment').toBe(1);
    expect(await dbCount(request, 'paymentHold', { orderId }), 'sipariş için tek hold').toBe(1);
  });
});

// ───────────────────────────── J75 — Escrow serbest (backdate + release-holds-due) ─────────────────────────────
test.describe('J75 — Para akışı: ödeme tutuldu, süre sonunda serbest', () => {
  test('ödeme hold da tutulur, süre dolmadan serbest değil, dolunca released', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı ödedi -> para emanette (hold = held)
    const { orderId, paymentId } = await apiBuyAndPay(request, buyerToken, product.id);
    const hold = await dbFind(request, 'paymentHold', { paymentId }, { id: true, status: true, releaseAt: true, amount: true });
    expect(hold, 'escrow hold oluştu').toBeTruthy();
    expect(hold.status, 'para beklemede').toBe('held');
    expect(Number(hold.amount), 'hold tutarı pozitif').toBeGreaterThan(0);

    // 2) Satıcı hazırlar, kargolar (delivered backdate), alıcı onaylar -> completed
    const sellerToken = await tokenForSeller(request, (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId);
    await driveToCompleted(request, buyerToken, sellerToken, orderId);

    // 3) Bekleme süresi dolmadan: release-holds-due çalışsa bile hold serbest DEĞİL (releaseAt gelecekte)
    await runScheduler(request, 'release-holds-due');
    expect((await dbFind(request, 'paymentHold', { paymentId }, { status: true })).status, 'süre dolmadan held kalır').toBe('held');

    // 4) Süre doldu -> releaseAt geçmişe çek + release-holds-due
    await backdate(request, 'paymentHold', { paymentId }, { releaseAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    await runScheduler(request, 'release-holds-due');

    // Sonuç: hold released (para satıcıya aktarıldı)
    const released = await expectDbEventually(
      request,
      'paymentHold',
      { paymentId },
      (h) => h?.status === 'released',
      8000,
    );
    expect(released.status).toBe('released');
  });
});

// ───────────────────────────── J28 — Callback storm idempotency 3x ─────────────────────────────
test.describe('J28 — Tekrarlı ödeme bildirimi: sistem bir kez işliyor', () => {
  test('aynı success callback 3x gelir, sipariş tam bir kez kesinleşir', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al + initiate (pending)
    const { orderId, paymentId, amount } = await buyAndInitiate(request, buyerToken, product.id);
    const totalKurus = Math.round(amount * 100);
    // bypass modunda providerConversationId boş -> merchant_oid = orderId ile eşleşir
    const cb = signPaytrCallback(orderId, 'success', totalKurus, PAYTR_KEY, PAYTR_SALT);

    // 2-3) Aynı geçerli success callback 3 kez (ağ tekrarı)
    for (let i = 0; i < 3; i++) {
      const res = await request.post(`${API}/payments/callback/paytr`, { form: cb });
      expect(res.ok(), `callback #${i + 1} OK döner`).toBeTruthy();
    }

    // 4) Sonuç: payment TAM bir kez completed, sipariş paid; çift hold/çift payment YOK
    const pay = await dbFind(request, 'payment', { id: paymentId }, { status: true });
    expect(pay.status, 'payment completed').toBe('completed');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toMatch(/paid|preparing/);
    expect(await dbCount(request, 'payment', { orderId }), 'tek payment').toBe(1);
    expect(await dbCount(request, 'paymentHold', { orderId }), 'tek hold (çift tahsilat yok)').toBe(1);
  });
});

// ───────────────────────────── J29 — Sahte imza callback red ─────────────────────────────
test.describe('J29 — Sahte ödeme bildirimi reddediliyor', () => {
  test('imzası bozuk callback sipariş durumunu değiştirmez, gerçek ödeme ilerler', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al + initiate (pending)
    const { orderId, paymentId, amount } = await buyAndInitiate(request, buyerToken, product.id);
    const totalKurus = Math.round(amount * 100);

    // 2) Sahte/bozuk imzalı success callback -> handler OK döner ama hash mismatch:
    //    test ortamında durum-sorgu (real PayTR) başarısız -> ödeme İŞLENMEZ.
    const forged = { merchant_oid: orderId, status: 'success', total_amount: String(totalKurus), hash: 'sahteimzaBOZUK==' };
    const res = await request.post(`${API}/payments/callback/paytr`, { form: forged });
    // PayTR protokolü gereği handler 200 OK döner (retry önlemek için) — ama state değişmez
    expect(res.ok(), 'callback 200 (PayTR protokolü)').toBeTruthy();

    // Sonuç: sipariş hâlâ pending_payment, payment hâlâ pending (sahte reddedildi)
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('pending_payment');
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');

    // 3-5) Alıcı gerçek ödemesini yapar (bypass) -> sipariş ilerler ve tamamlanır
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'gerçek ödeme').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');
    const sellerToken = await tokenForSeller(request, (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId);
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J88 — Webhook yanlış anahtar red ─────────────────────────────
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
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status, 'geçerli bildirim sonrası').toBe('completed');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toMatch(/paid|preparing/);

    // 5) Akış tamamlanır
    const sellerToken = await tokenForSeller(request, (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId);
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});

// ───────────────────────────── J96 — Teklif → sipariş → ödeme → satıcıya aktarım ─────────────────────────────
test.describe('J96 — Teklif → sipariş → ödeme → satıcıya aktarım', () => {
  test('teklif kabul edilir, sipariş oluşur, ödenir, hold süre sonunda serbest', async ({ page, request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı teklif verdi (ürün fiyatının en az %50'si). Teklif = fiyat (kabul kesin).
    const offerAmount = Number(product.price);
    const offerRes = await request.post(`${API}/offers`, {
      headers: auth(buyerToken),
      data: { productId: product.id, amount: offerAmount, message: 'Bu fiyata alabilir miyim?' },
    });
    expect(offerRes.ok(), 'teklif oluştu').toBeTruthy();
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
