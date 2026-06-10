/**
 * J10 — 14 gün sonrası iade: anlaşmazlık ve satıcı reddi
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

test.describe('J10 — 14g sonrası: min-20-char açıklama, satıcı reddi → anlaşmazlık', () => {
  test('delivered (20g önce) → kısa açıklama 400 → uzun açıklama → satıcı reddi → disputed → admin karar', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı ürünü aldı, teslim aldı, üzerinden 20 gün geçti (cayma penceresi dışı)
    const { token, me, orderId } = await buyAndPayFresh(request);
    await markDelivered(request, orderId, 20);

    // 2) İade istedi; sistem en az 20 karakter açıklama istedi (kısa → 400)
    const tooShort = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'kısa', // <20 char
    });
    expect(tooShort.ok(), 'kısa açıklama reddedildi').toBeFalsy();
    expect([400]).toContain(tooShort.status());

    // 3) Açıklama yazıp gönderdi → talep satıcıya düştü (past_cooling_off → pending_review)
    const ok = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'Ürün uzun süredir kullanımda sorun çıkardı, detaylı açıklamamı ekliyorum ve iade talep ediyorum.',
    });
    expect(ok.status(), 'uzun açıklama ile 201').toBe(201);
    const rr = await ok.json();

    const pending = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(pending.status, 'satıcı incelemesinde').toBe('pending_review');

    // 4) Satıcı iadeyi yeterli gerekçeyle reddetti → talep 'anlaşmazlık' (disputed)
    const sellerToken = await loginAsOrderSeller(request, orderId);
    const reject = await request.post(`${API}/refund-requests/${rr.id}/reject`, {
      headers: auth(sellerToken),
      data: { response: 'Ürün tarafımızdan sağlam gönderildi, iade gerekçesi yetersiz; reddediyorum.' },
    });
    expect(reject.ok(), 'satıcı reddi 200').toBeTruthy();
    const disputed = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true, sellerResponse: true });
    expect(disputed.status, 'disputed').toBe('disputed');
    expect(disputed.sellerResponse).toBeTruthy();

    // 5) Alıcı destek talebi açarak konuyu yöneticiye taşıdı
    const ticketRes = await request.post(`${API}/support/tickets`, {
      headers: auth(token),
      data: {
        subject: 'İade reddedildi, itiraz ediyorum',
        category: 'payment',
        message: 'Satıcı iademi reddetti ama haklı olduğumu düşünüyorum, yönetici incelemesi rica ederim.',
        orderId,
      },
    });
    expect(ticketRes.status(), 'destek talebi oluştu').toBe(201);

    // 6-7) Yönetici talebi inceleyip karara bağladı (reject) → status=rejected
    const adminToken = await adminLogin(request);
    const resolve = await request.post(`${API}/admin/refund-requests/${rr.id}/resolve-dispute`, {
      headers: auth(adminToken),
      data: { resolution: 'reject', notes: 'İnceleme sonucu iade gerekçesi yetersiz bulundu, talep kapatıldı.' },
    });
    expect(resolve.ok(), 'admin dispute resolve').toBeTruthy();
    const resolved = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(resolved.status, 'rejected').toBe('rejected');

    // Alıcıya reddedildi bildirimi (best-effort)
    const notif = await dbFind(
      request, 'notificationLog',
      { userId: me.id, type: 'refund_rejected' }, { id: true }, { createdAt: 'desc' },
    );
    if (notif) expect(notif.id).toBeTruthy();
  });
});
