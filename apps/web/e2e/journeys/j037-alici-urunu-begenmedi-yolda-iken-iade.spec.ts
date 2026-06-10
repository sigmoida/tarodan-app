/**
 * J37 — Alıcı ürünü beğenmedi: yolda iken iade
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

test.describe('J37 — Yolda iade: wait_for_delivery → teslim → return açılır → refunded', () => {
  test('shipped/in_transit → cooling-off iade wait_for_delivery → delivered → return → finalize', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı aldı, ödedi; satıcı kargoladı (shipped + shipment in_transit)
    const { token, orderId } = await buyAndPayFresh(request);
    await backdate(request, 'order', { id: orderId }, { status: 'shipped' });
    await backdate(
      request, 'shipment', { orderId },
      { status: 'in_transit', shippedAt: new Date().toISOString() },
    );

    // 2) Ürün yoldayken alıcı iade istedi (cooling-off, henüz teslim olmadı)
    const res = await createRefund(request, token, orderId, {
      reason: 'not_as_described', evidencePhotoUrls: ['https://test.local/ev.jpg'],
      description: 'Ürünü beğenmedim, yoldayken iade talebi açıyorum.',
    });
    expect(res.status(), 'yolda iade 201').toBe(201);
    const rr = await res.json();

    // 3) Talep 'teslimat bekleniyor' (wait_for_delivery) durumuna düştü, return HENÜZ açılmadı
    const waiting = await dbFind(request, 'refundRequest', { id: rr.id }, {
      status: true, decidedBy: true, returnTrackingNumber: true,
    });
    expect(waiting.status, 'wait_for_delivery').toBe('wait_for_delivery');
    expect(waiting.decidedBy).toBe('system');
    expect(waiting.returnTrackingNumber, 'return henüz açılmadı').toBeFalsy();

    // 4) Ürün alıcıya teslim oldu (backdate: order delivered + shipment delivered)
    await markDelivered(request, orderId, 1);

    // 5) Sistem otomatik kontrolde iade kargosunu açtı.
    //    NOT: RefundSchedulerService.openReturnShipmentsForDeliveredOrders cron'u
    //    /dev/run ile EXPOSE EDİLMEMİŞ. wait_for_delivery → return_shipment_open
    //    geçişini backdate ile sürüyoruz (gerçek cron aynı geçişi yapardı).
    await backdate(
      request, 'refundRequest', { id: rr.id },
      {
        status: 'return_delivered',
        returnProvider: 'manual',
        returnTrackingNumber: rr.refundNumber,
        returnStatus: 'delivered',
        returnCreatedAt: new Date().toISOString(),
        returnDeliveredAt: new Date().toISOString(),
      },
    );

    // 6) Alıcı ürünü iade etti, para iade edildi → admin force-finalize
    const adminToken = await adminLogin(request);
    const fin = await request.post(`${API}/admin/refund-requests/${rr.id}/force-finalize`, {
      headers: auth(adminToken),
    });
    expect(fin.ok(), 'force-finalize').toBeTruthy();

    const refunded = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true, refundedAt: true });
    expect(refunded.status, 'refunded').toBe('refunded');
    expect(refunded.refundedAt).toBeTruthy();

    const pay = await dbFind(request, 'payment', { orderId }, { status: true });
    expect(pay.status).toBe('refunded');
  });
});
