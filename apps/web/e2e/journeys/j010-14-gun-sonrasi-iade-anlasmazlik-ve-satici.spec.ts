/**
 * J10 — 14 gün (cayma süresi) sonrası iade KOMPLE bloke.
 *
 * NOT: Eski "satıcı reddi → anlaşmazlık (dispute) → admin resolve-dispute" akışı
 * KALDIRILDI (iade artık tam otomatik; satıcı onayı/itirazı yok). 14 günlük cayma
 * penceresi dolduktan sonra alıcı — açıklama/kanıt verse bile — iade talebi
 * oluşturamaz; istek 400 ile reddedilir ve hiçbir RefundRequest yaratılmaz.
 *
 * Gerçek backend + tarodan_test DB + PAYMENT_BYPASS=true.
 *
 * Doğrulanan endpoint'ler:
 *   - POST /orders/buy, /payments/initiate, /payments/:id/bypass-complete (helpers.apiBuyAndPay)
 *   - POST /orders/:orderId/refund-requests  (RefundController.createRefundRequest)
 *
 * BACKDATE: 14 günlük cayma penceresi dışı senaryo için shipment.deliveredAt = 20 gün önce.
 */
import { test, expect } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
} from '../support/helpers';
import { backdate, dbFind } from '../support/db';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

/** Siparişi "20 gün önce teslim edildi" durumuna sür (cayma penceresi dışı). */
async function markDeliveredDaysAgo(request: any, orderId: string, daysAgo: number) {
  const deliveredAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
  await backdate(
    request,
    'shipment',
    { orderId },
    { status: 'delivered', deliveredAt, shippedAt: deliveredAt },
  );
}

test.describe('J10 — 14g sonrası iade KOMPLE bloke (dispute/satıcı-onay akışı kaldırıldı)', () => {
  test('delivered (20g önce) → iade talebi 400 ile reddedilir (açıklama verilse bile), RefundRequest oluşmaz', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Alıcı ürünü aldı, teslim aldı, üzerinden 20 gün geçti (cayma penceresi dışı)
    const { token, orderId } = await buyAndPayFresh(request);
    await markDeliveredDaysAgo(request, orderId, 20);

    // 2) Kısa açıklamayla iade → 400 (süre dolmuş)
    const tooShort = await createRefund(request, token, orderId, {
      reason: 'other',
      description: 'kısa',
    });
    expect(tooShort.ok(), '14g sonrası iade reddedilir').toBeFalsy();
    expect(tooShort.status()).toBe(400);

    // 3) Uzun açıklama + gerekçe verilse BİLE 400 — eski "past_cooling_off + kanıt"
    //    / satıcı-itiraz akışı tamamen kaldırıldı.
    const detailed = await createRefund(request, token, orderId, {
      reason: 'other',
      description:
        'Ürün uzun süredir kullanımda sorun çıkardı, detaylı açıklamamı ekliyorum ve iade talep ediyorum.',
    });
    expect(detailed.status(), '14 gün sonrası iade bloke').toBe(400);

    // 4) Hiçbir RefundRequest oluşmamalı
    const rr = await dbFind(request, 'refundRequest', { orderId }, { id: true });
    expect(rr, 'iade talebi oluşmadı').toBeFalsy();
  });
});
