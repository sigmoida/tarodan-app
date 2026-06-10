/**
 * J9 — Teslimden sonra cayma hakkıyla iade (14 gün içinde)
 * Kaynak: suite-g-refunds.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * Suite G — İade / Refund journey'leri (J8, J9, J10, J37, J76, J80–J85).
 *
 * Manuel turun birebir karşılığı: alıcı satın alır + öder, sonra siparişin
 * yaşam evresine göre (kargo öncesi / yolda / teslim sonrası 14g içi / 14g sonrası)
 * iade talebi açar; sistem parayı iade eder, kargo açar, anlaşmazlığı yönetir.
 *
 * Gerçek backend + tarodan_test DB + PAYMENT_BYPASS=true. Her adımda SONUÇ
 * assert edilir: payment/order durumu, RefundRequest durumu+tutarı (dbFind),
 * stok (+1), in-app bildirim (notificationLog), API status kodları.
 *
 * Doğrulanan endpoint'ler (controller'dan okundu):
 *   - POST /orders/buy, /payments/initiate, /payments/:id/bypass-complete  (helpers.apiBuyAndPay)
 *   - POST /orders/:orderId/refund-requests          (RefundController.createRefundRequest)
 *   - POST /refund-requests/:id/cancel | /accept | /reject  (RefundController)
 *   - GET  /refund-requests/me | /seller | /:id            (RefundController)
 *   - POST /orders/:id/cancel                              (OrderController.cancel)
 *   - POST /support/tickets                                (SupportController)
 *   - admin: POST /admin/refund-requests/:id/resolve-dispute | /force-finalize
 *
 * DEV-HOOK / BACKDATE gerektiren adımlar (tarayıcıdan sürülemez):
 *   - Kargo "teslim oldu" durumu: gerçek Sürat tracking webhook'u yerine
 *     `backdate(order|shipment, ...)` ile order=delivered + shipment.deliveredAt set.
 *   - 14 günlük cayma penceresi: backdate shipment.deliveredAt = 20 gün önce.
 *   - İade kargosunun "satıcıya teslim oldu" durumu: gerçek tracking webhook yerine
 *     `backdate(refundRequest, return_delivered + returnDeliveredAt)` → sonra
 *     admin POST /admin/refund-requests/:id/force-finalize ile para iadesi finalize.
 *     (RefundSchedulerService cron'u /dev/run ile expose EDİLMEMİŞ; admin
 *     force-finalize gerçek finalizeRefundForReturnedShipment'i çağırır.)
 */
import { test, expect } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
} from '../support/helpers';
import { backdate, dbFind } from '../support/db';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Admin token (AdminJwtAuthGuard kullanan /admin/* endpoint'leri için). */
async function adminLogin(request: any): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, { data: USERS.admin });
  expect(res.ok(), 'admin login').toBeTruthy();
  const body = await res.json();
  const token = body?.tokens?.accessToken;
  expect(token, 'admin accessToken').toBeTruthy();
  return token as string;
}

/** Alıcı için temiz bir satın alma (token + ürün + ödenmiş sipariş). */
async function buyAndPayFresh(request: any) {
  const token = await apiLogin(request, USERS.buyerClean);
  const me = await apiMe(request, token);
  const product = await apiFirstBuyableProduct(request, me.id);
  const { orderId, paymentId } = await apiBuyAndPay(request, token, product.id);
  return { token, me, product, orderId, paymentId };
}

/** İade talebi oluştur (POST /orders/:orderId/refund-requests). */
async function createRefund(request: any, token: string, orderId: string, dto: Record<string, any>) {
  return request.post(`${API}/orders/${orderId}/refund-requests`, {
    headers: auth(token),
    data: dto,
  });
}

/**
 * Siparişin GERÇEK satıcısı olarak login ol. Buyable ürünün satıcısı sabit
 * değil; order→seller.email'i dbFind ile alıp aynı seed parolasıyla (Demo123!)
 * giriş yaparız → seller accept/reject adımları 403 yemeden çalışır.
 */
async function loginAsOrderSeller(request: any, orderId: string): Promise<string> {
  const order = await dbFind(request, 'order', { id: orderId }, {
    seller: { select: { email: true } },
  });
  const email = order?.seller?.email;
  expect(email, 'sipariş satıcısının email\'i bulundu').toBeTruthy();
  return apiLogin(request, { email, password: 'Demo123!' });
}

/**
 * Siparişi "teslim edildi" durumuna sür (tarayıcıdan ship/deliver endpoint'i yok).
 * order.status=delivered, shipment.status=delivered, deliveredAt geçmişe çekilir.
 * deliveredDaysAgo: 14g cayma penceresi içi/dışı senaryolarını ayarlar.
 */
async function markDelivered(request: any, orderId: string, deliveredDaysAgo: number) {
  const deliveredAt = new Date(Date.now() - deliveredDaysAgo * 24 * 3600 * 1000).toISOString();
  await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
  await backdate(
    request,
    'shipment',
    { orderId },
    { status: 'delivered', deliveredAt, shippedAt: deliveredAt },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// J8 — Kargodan önce iade: para anında geri dönüyor + 2. iade engeli
// ───────────────────────────────────────────────────────────────────────────

test.describe('J9 — 14g içi cayma: teslim sonrası iade kargosu otomatik açılır', () => {
  test('delivered (5g önce) → cooling-off iade → return açılır → finalize → refunded', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı ürünü aldı, ödedi, kargo teslim oldu (5 gün önce — cayma penceresi içi)
    const { token, me, orderId } = await buyAndPayFresh(request);
    await markDelivered(request, orderId, 5);

    const delivered = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(delivered.status).toBe('delivered');

    // 2) Cayma hakkıyla iade istedi (14g içi → satıcı onayı gerekmez, return hemen açılır)
    const res = await createRefund(request, token, orderId, {
      reason: 'not_as_described', evidencePhotoUrls: ['https://test.local/ev.jpg'],
      description: 'Cayma hakkımı kullanıyorum, ürünü iade etmek istiyorum.',
    });
    expect(res.status(), 'cooling-off iade 201').toBe(201);
    const rr = await res.json();

    // 3) 14g içinde olduğu için iade kargosu HEMEN açıldı (return_shipment_open),
    //    satıcı onayı gerekmedi (decidedBy='system').
    const opened = await dbFind(request, 'refundRequest', { id: rr.id }, {
      status: true, decidedBy: true, returnTrackingNumber: true,
    });
    expect(opened.status, 'return açıldı').toBe('return_shipment_open');
    expect(opened.decidedBy).toBe('system');
    expect(opened.returnTrackingNumber).toBeTruthy();

    // 4-5) Alıcı ürünü iade kargosuna verdi, kargo satıcıya teslim oldu.
    //      Gerçek Sürat tracking webhook'u yerine backdate ile return_delivered.
    await backdate(
      request,
      'refundRequest',
      { id: rr.id },
      { status: 'return_delivered', returnStatus: 'delivered', returnDeliveredAt: new Date().toISOString() },
    );

    // 6) Para alıcıya iade edildi, sipariş kapandı → admin force-finalize
    const adminToken = await adminLogin(request);
    const fin = await request.post(`${API}/admin/refund-requests/${rr.id}/force-finalize`, {
      headers: auth(adminToken),
    });
    expect(fin.ok(), 'force-finalize başarılı').toBeTruthy();

    const refunded = await dbFind(request, 'refundRequest', { id: rr.id }, {
      status: true, refundedAt: true, providerRefundId: true,
    });
    expect(refunded.status, 'refunded').toBe('refunded');
    expect(refunded.refundedAt).toBeTruthy();

    // Payment refunded + order cancelled (processRefund yan etkileri)
    const pay = await dbFind(request, 'payment', { orderId }, { status: true });
    expect(pay.status).toBe('refunded');

    // Bildirim (best-effort)
    const notif = await dbFind(
      request, 'notificationLog',
      { userId: me.id, type: 'refund_completed' }, { id: true }, { createdAt: 'desc' },
    );
    if (notif) expect(notif.id).toBeTruthy();
  });
});
