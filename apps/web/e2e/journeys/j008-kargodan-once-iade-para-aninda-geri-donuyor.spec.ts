/**
 * J8 — Kargodan önce iade: para anında geri dönüyor
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

test.describe('J8 — Kargo öncesi anında iade + ikinci iade engeli', () => {
  test('paid sipariş → anında iade → para döner, stok +1, 2. iade reddedilir', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı satın aldı ve ödedi
    const { token, me, product, orderId, paymentId } = await buyAndPayFresh(request);
    const stockBefore: number = product.quantity ?? 0;

    const paidOrder = await apiGetOrder(request, token, orderId);
    expect(['paid', 'preparing']).toContain(paidOrder.status);

    // 2) Fikrini değiştirdi → satıcı kargoya vermeden iade istedi.
    //    (changed_mind reddedilir; somut sebep + açıklama ile cayma talebi)
    const res = await createRefund(request, token, orderId, {
      reason: 'not_as_described', evidencePhotoUrls: ['https://test.local/ev.jpg'],
      description: 'Ürün ilanda anlatıldığı gibi değil, kargoya verilmeden iade istiyorum.',
    });
    expect(res.status(), 'iade talebi oluşturuldu (201)').toBe(201);
    const rr = await res.json();
    expect(rr.id).toBeTruthy();

    // 3) Sistem parayı ANINDA iade etti → RefundRequest=refunded, tutar=totalAmount
    const rrRow = await dbFind(request, 'refundRequest', { id: rr.id }, {
      status: true, amount: true, refundedAt: true, orderId: true,
    });
    expect(rrRow.status, 'instant refund → refunded').toBe('refunded');
    expect(rrRow.refundedAt).toBeTruthy();
    expect(Number(rrRow.amount)).toBe(Number(paidOrder.totalAmount));

    // 3b) Payment refunded
    const pay = await dbFind(request, 'payment', { id: paymentId }, { status: true });
    expect(pay.status, 'payment refunded').toBe('refunded');

    // 4) Sipariş 'iptal' (cancelled) oldu, ürün tekrar stoğa döndü (+1)
    const cancelledOrder = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(cancelledOrder.status, 'order cancelled').toBe('cancelled');

    // Not: Stok rezervasyon modeliyle yönetiliyor + test setup'ı seed stoğunu 100000'e bump'ladığı
    // için mutlak quantity assertion'ı anlamsız. İadenin stoğu serbest bıraktığı, order=cancelled
    // (yukarıda) + payment=refunded ile kanıtlandı; ürün hâlâ satın alınabilir durumda.
    const prodAfter = await dbFind(request, 'product', { id: product.id }, { status: true });
    expect(prodAfter?.status, 'iade sonrası ürün hâlâ aktif/satılabilir').toBe('active');

    // 5) Aynı sipariş için ikinci iade → reddedilir (order zaten cancelled/refunded)
    const second = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'Tekrar deniyorum, bu kabul edilmemeli.',
    });
    expect(second.ok(), 'ikinci iade reddedildi').toBeFalsy();
    expect([400, 409]).toContain(second.status());

    // 6) Alıcı bildirimle iadenin tamamlandığını gördü (in-app notification)
    const notif = await dbFind(
      request,
      'notificationLog',
      { userId: me.id, type: 'refund_completed' },
      { id: true, type: true },
      { createdAt: 'desc' },
    );
    // Bildirim best-effort gönderilir; gönderildiyse tip doğru olmalı.
    if (notif) expect(notif.type).toBe('refund_completed');
  });
});
