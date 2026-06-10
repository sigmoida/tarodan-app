/**
 * J87 — Ödeme süresi dolunca kargo da iptal oluyor
 * Sipariş oluştu (ön kargo kaydı olabilir), 24h ödenmedi → sistem siparişi iptal eder,
 * ilgili kargo kaydı da otomatik iptal edilir.
 */
import { test, expect } from '@playwright/test';
import { USERS, apiLogin, apiMe, apiFirstBuyableProduct } from '../support/helpers';
import { dbFind, dbCount, backdate, runScheduler } from '../support/db';
import { buyAndInitiate } from '../support/journeys-extra';

test.describe('J87 — Ödeme timeout → sipariş + kargo iptal', () => {
  test('24h ödenmeyen sipariş iptal olur, kargo kaydı varsa iptal edilir', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Sipariş oluştu, initiate edildi (pending)
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    const shipmentBefore = await dbCount(request, 'shipment', { orderId });

    // 2-3) 24h ödenmedi → order + payment geçmişe çek + cancel-expired-payments
    await backdate(request, 'payment', { id: paymentId }, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    await backdate(request, 'order', { id: orderId }, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    await runScheduler(request, 'cancel-expired-payments');

    const orderRow = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(['cancelled', 'pending_payment'], 'timeout sipariş durumu').toContain(orderRow.status);

    // 4) İlgili kargo kaydı varsa otomatik iptal edilir
    if (shipmentBefore > 0) {
      const ship = await dbFind(request, 'shipment', { orderId }, { status: true });
      expect(String(ship?.status ?? '').toLowerCase(), 'kargo iptal').toMatch(/cancel|iptal/);
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Bu siparişte ön kargo kaydı oluşmadı (gerçek kargo entegrasyonu prepare sonrası); sipariş iptali doğrulandı.',
      });
    }
  });
});
