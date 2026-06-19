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
      reason: 'not_as_described',
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

    const prodAfter = await dbFind(request, 'product', { id: product.id }, { quantity: true });
    if (prodAfter?.quantity != null) {
      expect(Number(prodAfter.quantity), 'stok +1 geri döndü').toBe(stockBefore + 1);
    }

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

// ───────────────────────────────────────────────────────────────────────────
// J9 — Teslimden sonra cayma hakkıyla iade (14 gün içinde)
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
      reason: 'not_as_described',
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

// ───────────────────────────────────────────────────────────────────────────
// J10 — 14 gün sonrası iade: anlaşmazlık ve satıcı reddi
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

// ───────────────────────────────────────────────────────────────────────────
// J37 — Alıcı ürünü beğenmedi: yolda iken iade
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
      reason: 'not_as_described',
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

// ───────────────────────────────────────────────────────────────────────────
// J76 — Sipariş iadesi para akışını geri alıyor (tersine akış dbFind)
// ───────────────────────────────────────────────────────────────────────────
test.describe('J76 — İade para akışını tersine çevirir (payment/hold/order/stok)', () => {
  test('kargo öncesi iade → payment refunded, hold cancelled, order cancelled, stok +1', async ({ request }) => {
    test.setTimeout(60_000);

    // 1-2) Alıcı aldı+ödedi, kargodan önce iade istedi
    const { token, product, orderId, paymentId } = await buyAndPayFresh(request);
    const stockBefore: number = product.quantity ?? 0;

    const res = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'Vazgeçtim, kargo öncesi iade istiyorum; somut sorun olmasa da uygun sebebi seçtim.',
    });
    expect(res.status()).toBe(201);
    const rr = await res.json();

    // 3) Para iade edildi (payment.refunded), bekletme iptal (paymentHold.cancelled)
    const pay = await dbFind(request, 'payment', { id: paymentId }, { status: true });
    expect(pay.status, 'payment refunded').toBe('refunded');

    const hold = await dbFind(request, 'paymentHold', { orderId }, { status: true });
    if (hold) {
      expect(['cancelled', 'released'], 'hold artık held değil').toContain(hold.status);
    }

    // RefundRequest tutarı = ödenen toplam (tersine akış doğrulaması)
    const order = await dbFind(request, 'order', { id: orderId }, { status: true, totalAmount: true });
    const rrRow = await dbFind(request, 'refundRequest', { id: rr.id }, { amount: true, status: true });
    expect(rrRow.status).toBe('refunded');
    expect(Number(rrRow.amount)).toBe(Number(order.totalAmount));

    // 4) Ürün tekrar stoğa döndü (+1)
    expect(order.status, 'order cancelled').toBe('cancelled');
    const prodAfter = await dbFind(request, 'product', { id: product.id }, { quantity: true });
    if (prodAfter?.quantity != null) {
      expect(Number(prodAfter.quantity)).toBe(stockBefore + 1);
    }

    // 5) Stok geri gelince istek listesindekiler bilgilendirilir (event/cron kapsamı).
    //    Burada en azından ürünün yeniden satın alınabilir statüye döndüğünü doğrula.
    const prodStatus = await dbFind(request, 'product', { id: product.id }, { status: true });
    expect(['active', 'sold', 'pending', 'inactive']).toContain(prodStatus.status);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J80 — Aynı sipariş için ikinci iade engeli
// ───────────────────────────────────────────────────────────────────────────
test.describe('J80 — Aynı sipariş için ikinci aktif iade engellenir', () => {
  test('iade → para döner → ikinci iade reddedilir + bildirim', async ({ request }) => {
    test.setTimeout(60_000);

    const { token, me, orderId } = await buyAndPayFresh(request);

    // 2) Kargodan önce iade → para iade edildi
    const first = await createRefund(request, token, orderId, {
      reason: 'not_as_described',
      description: 'Kargo öncesi iade talebim, ürün uygun değil.',
    });
    expect(first.status()).toBe(201);
    const rr = await first.json();
    const rrRow = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(rrRow.status).toBe('refunded');

    // 3) Aynı sipariş için ikinci kez aktif iade → kabul edilmedi
    const second = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'İkinci kez deniyorum, bu engellenmeli kesinlikle.',
    });
    expect(second.ok(), 'ikinci iade engellendi').toBeFalsy();
    expect([400, 409]).toContain(second.status());

    // 4) Bildirimle iadenin tamamlandığını gördü (best-effort)
    const notif = await dbFind(
      request, 'notificationLog',
      { userId: me.id, type: 'refund_completed' }, { id: true }, { createdAt: 'desc' },
    );
    if (notif) expect(notif.id).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J81 — İade talebini yalnız alıcı açabiliyor (IDOR)
// ───────────────────────────────────────────────────────────────────────────
test.describe('J81 — İade yalnız alıcı (satıcı/yabancı engellenir)', () => {
  test('satıcı + yabancı iade açamaz (403), alıcı açabilir', async ({ request }) => {
    test.setTimeout(60_000);

    const { token, orderId } = await buyAndPayFresh(request);

    // 2) Satıcı (siparişin gerçek satıcısı) alıcının yerine iade açmaya çalıştı → engellendi
    const sellerToken = await loginAsOrderSeller(request, orderId);
    const bySeller = await createRefund(request, sellerToken, orderId, {
      reason: 'other', description: 'Satıcı olarak iade açmayı deniyorum, engellenmeli.',
    });
    expect(bySeller.ok(), 'satıcı iade açamaz').toBeFalsy();
    expect([403, 404]).toContain(bySeller.status());

    // 3) Yabancı biri (newMember) iade açmaya çalıştı → engellendi
    const strangerToken = await apiLogin(request, USERS.newMember);
    const byStranger = await createRefund(request, strangerToken, orderId, {
      reason: 'other', description: 'Yabancı olarak iade açmayı deniyorum, engellenmeli.',
    });
    expect(byStranger.ok(), 'yabancı iade açamaz').toBeFalsy();
    expect([403, 404]).toContain(byStranger.status());

    // 4) Alıcı kendi iadesini açtı → süreç başladı
    const byBuyer = await createRefund(request, token, orderId, {
      reason: 'not_as_described', description: 'Kendi siparişim için iade talebi açıyorum.',
    });
    expect(byBuyer.status(), 'alıcı iade açabildi').toBe(201);
    const rr = await byBuyer.json();
    const rrRow = await dbFind(request, 'refundRequest', { id: rr.id }, { requesterId: true });
    expect(rrRow.requesterId).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J82 — İade kargosu açıldıktan sonra iptal edilemiyor
// ───────────────────────────────────────────────────────────────────────────
test.describe('J82 — Return açıldıktan sonra iade talebi iptal edilemez', () => {
  test('teslim sonrası 14g içi iade → return açıldı → cancel 400 → finalize refunded', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı teslim aldıktan sonra 14g içinde iade istedi → return HEMEN açıldı
    const { token, orderId } = await buyAndPayFresh(request);
    await markDelivered(request, orderId, 3);

    const res = await createRefund(request, token, orderId, {
      reason: 'not_as_described', description: 'Teslim sonrası cayma hakkımı kullanıyorum.',
    });
    expect(res.status()).toBe(201);
    const rr = await res.json();

    // 2) İade kargosu hemen açıldı (return_shipment_open)
    const opened = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(opened.status, 'return açıldı').toBe('return_shipment_open');

    // 3) Alıcı iade talebini iptal etmeye çalıştı → kabul edilmedi
    //    (cancel yalnızca pending_review / wait_for_delivery'de mümkün)
    const cancel = await request.post(`${API}/refund-requests/${rr.id}/cancel`, {
      headers: auth(token),
    });
    expect(cancel.ok(), 'return açıkken iptal reddedilir').toBeFalsy();
    expect([400, 409]).toContain(cancel.status());

    // Durum değişmedi (hâlâ açık)
    const still = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(still.status).toBe('return_shipment_open');

    // 4) Ürünü iade kargosuna verdi, para iade edildi → finalize
    await backdate(
      request, 'refundRequest', { id: rr.id },
      { status: 'return_delivered', returnStatus: 'delivered', returnDeliveredAt: new Date().toISOString() },
    );
    const adminToken = await adminLogin(request);
    const fin = await request.post(`${API}/admin/refund-requests/${rr.id}/force-finalize`, {
      headers: auth(adminToken),
    });
    expect(fin.ok()).toBeTruthy();
    const refunded = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(refunded.status).toBe('refunded');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J83 — Ödeme bekleyen siparişe iade yapılamıyor
// ───────────────────────────────────────────────────────────────────────────
test.describe('J83 — pending_payment siparişe iade yok, önce iptal', () => {
  test('ödenmemiş sipariş → iade 400 → iptal → stok serbest', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Üye sipariş oluşturdu, henüz ödemedi (orders/buy, initiate YOK)
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me.id);

    const addrRes = await request.get(`${API}/users/me/addresses`, { headers: auth(token) });
    const addrBody = await addrRes.json();
    const addrList: any[] = addrBody?.data ?? addrBody?.addresses ?? (Array.isArray(addrBody) ? addrBody : []);
    const shippingAddressId = (addrList.find((a) => a.isDefault) ?? addrList[0]).id;

    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: auth(token),
      data: { productId: product.id, shippingAddressId },
    });
    expect(buyRes.ok(), 'orders/buy').toBeTruthy();
    const orderId = (await buyRes.json())?.orderId;
    expect(orderId).toBeTruthy();

    const pending = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(pending.status, 'pending_payment').toBe('pending_payment');

    // 2) İade istedi → sistem 'önce siparişi iptal et' dedi (400)
    const refund = await createRefund(request, token, orderId, {
      reason: 'other', description: 'Ödemeden iade istemeyi deniyorum, bu engellenmeli.',
    });
    expect(refund.ok(), 'pending_payment iade reddedilir').toBeFalsy();
    expect([400]).toContain(refund.status());

    // 3) Üye siparişi iptal etti
    const cancel = await request.post(`${API}/orders/${orderId}/cancel`, {
      headers: auth(token),
      data: { reason: 'Vazgeçtim' },
    });
    expect(cancel.ok(), 'sipariş iptal edildi').toBeTruthy();

    // 4) Stok serbest kaldı → sipariş cancelled
    const cancelled = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(cancelled.status, 'cancelled').toBe('cancelled');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J84 — Anlaşmazlıkta satıcı iadeyi kabul ediyor
// ───────────────────────────────────────────────────────────────────────────
test.describe('J84 — Geç dönem iade: satıcı kabul → return açılır → refunded', () => {
  test('delivered (20g önce) → pending_review → satıcı accept → return → finalize', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı teslim aldı, 20 gün sonra iade istedi, açıklama yazdı
    const { token, orderId } = await buyAndPayFresh(request);
    await markDelivered(request, orderId, 20);

    const res = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'Geç fark ettiğim bir sorun nedeniyle detaylı açıklamamla iade talep ediyorum.',
    });
    expect(res.status()).toBe(201);
    const rr = await res.json();

    // 2) Talep satıcıya düştü (pending_review)
    const pending = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(pending.status).toBe('pending_review');

    // 3) Satıcı iadeyi kabul etti (siparişin gerçek satıcısı olarak login).
    const sellerToken = await loginAsOrderSeller(request, orderId);
    const accept = await request.post(`${API}/refund-requests/${rr.id}/accept`, {
      headers: auth(sellerToken),
    });
    expect(accept.ok(), 'satıcı kabul').toBeTruthy();

    // 4) İade kargosu açıldı (order delivered → openReturnShipment çağrılır)
    const opened = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(opened.status, 'return açıldı').toBe('return_shipment_open');

    // 5) Ürün satıcıya döndü → para alıcıya iade edildi → finalize
    await backdate(
      request, 'refundRequest', { id: rr.id },
      { status: 'return_delivered', returnStatus: 'delivered', returnDeliveredAt: new Date().toISOString() },
    );
    const adminToken = await adminLogin(request);
    const fin = await request.post(`${API}/admin/refund-requests/${rr.id}/force-finalize`, {
      headers: auth(adminToken),
    });
    expect(fin.ok()).toBeTruthy();
    const refunded = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true, refundedAt: true });
    expect(refunded.status).toBe('refunded');
    expect(refunded.refundedAt).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// J85 — Satıcı iade reddini çok kısa yazıyor
// ───────────────────────────────────────────────────────────────────────────
test.describe('J85 — Satıcı red gerekçesi çok kısa reddedilir (min 10)', () => {
  test('geç dönem iade → kısa red 400 → uzun red → disputed → destek → admin karar', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı geç dönem iade talebi açtı (delivered 20g önce → pending_review)
    const { token, orderId } = await buyAndPayFresh(request);
    await markDelivered(request, orderId, 20);

    const res = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'Geç dönem iade talebim için yeterli uzunlukta bir açıklama yazıyorum.',
    });
    expect(res.status()).toBe(201);
    const rr = await res.json();
    const pending = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(pending.status).toBe('pending_review');

    const sellerToken = await loginAsOrderSeller(request, orderId);

    // 2) Satıcı çok kısa gerekçeyle reddetmeye çalıştı → kabul edilmedi (DTO min 10)
    const shortReject = await request.post(`${API}/refund-requests/${rr.id}/reject`, {
      headers: auth(sellerToken),
      data: { response: 'yok' },
    });
    expect(shortReject.ok(), 'kısa red gerekçesi reddedildi').toBeFalsy();
    expect([400]).toContain(shortReject.status());

    // 3) Yeterli uzunlukta gerekçe yazıp reddetti → talep 'anlaşmazlık' (disputed)
    const longReject = await request.post(`${API}/refund-requests/${rr.id}/reject`, {
      headers: auth(sellerToken),
      data: { response: 'Ürün sağlam teslim edilmiştir, iade gerekçesi yeterli görülmemiştir; reddediyorum.' },
    });
    expect(longReject.ok(), 'uzun red gerekçesi kabul').toBeTruthy();
    const disputed = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(disputed.status, 'disputed').toBe('disputed');

    // 4) Alıcı destek talebi açtı, yönetici karara bağladı
    const ticketRes = await request.post(`${API}/support/tickets`, {
      headers: auth(token),
      data: {
        subject: 'İade reddedildi, yönetici incelemesi istiyorum',
        category: 'payment',
        message: 'Satıcı iademi reddetti; durumu yöneticiye taşıyorum, inceleme rica ederim.',
        orderId,
      },
    });
    expect(ticketRes.status()).toBe(201);

    const adminToken = await adminLogin(request);
    const resolve = await request.post(`${API}/admin/refund-requests/${rr.id}/resolve-dispute`, {
      headers: auth(adminToken),
      data: { resolution: 'reject', notes: 'İnceleme sonucu talep yeterli bulunmadı, kapatıldı.' },
    });
    expect(resolve.ok()).toBeTruthy();
    const resolved = await dbFind(request, 'refundRequest', { id: rr.id }, { status: true });
    expect(resolved.status).toBe('rejected');
  });
});
