/**
 * J73 — Kaçırılan ödeme bildirimi otomatik kurtarılıyor
 * Ödeme yapıldı ama webhook ulaşmadı → sipariş 'pending_payment' kalır →
 * otomatik kontrol (reconcile-paytr) durumu sorgular. Test ortamında gerçek PayTR
 * sorgusu olmadığından (bypass), kurtarma bypass-complete ile temsil edilir; ardından
 * akış tamamlanır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct } from '../support/helpers';
import { dbFind, runScheduler } from '../support/db';
import { tokenForSeller, driveToCompleted, buyAndInitiate } from '../support/journeys-extra';

test.describe('J73 — Kaçırılan bildirim otomatik kontrolle kurtarılır', () => {
  test('pending kalan ödeme → reconcile-paytr çalışır → kesinleşir → tamamlanır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1-2) Ödeme başlatıldı, bildirim ulaşmadı → pending_payment kalır
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('pending');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('pending_payment');

    // 3) Otomatik kontrol (reconcile-paytr) çalışır — gerçek PayTR sorgusu test ortamında yok
    const recon = await runScheduler(request, 'reconcile-paytr');
    expect(recon, 'reconcile-paytr çalıştı').toBeTruthy();
    test.info().annotations.push({
      type: 'note',
      description:
        'reconcile-paytr gerçek PayTR durum-sorgusu yapar; PAYMENT_BYPASS test ortamında ' +
        'gerçek sağlayıcı sorgusu olmadığından ödeme bypass-complete ile kesinleştirilir.',
    });

    // Kurtarma: ödeme kesinleşir (bypass)
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'ödeme kesinleşti').toBeTruthy();
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');

    // 4) Satıcı hazırlar, teslim edilir → tamamlanır
    const sellerId = (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId;
    await driveToCompleted(request, buyerToken, await tokenForSeller(request, sellerId), orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
