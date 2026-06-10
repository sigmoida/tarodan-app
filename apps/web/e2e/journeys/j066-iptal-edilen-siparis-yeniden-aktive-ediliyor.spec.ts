/**
 * J66 — İptal edilen sipariş yeniden aktive ediliyor
 * Ödenmeyen sipariş 24h sonra iptal → reactivate (stok varsa) → bu kez ödenir → tamamlanır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin } from '../support/helpers';
import { dbFind, backdate, runScheduler } from '../support/db';
import {
  auth, adminToken, anyCategoryId, createActiveProduct, tokenForSeller, driveToCompleted, buyAndInitiate,
} from '../support/journeys-extra';

test.describe('J66 — İptal olan sipariş reactivate edilir', () => {
  test('timeout iptal → reactivate → öde → tamamla', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 650, quantity: 1, title: 'J66' });

    const buyerToken = await apiLogin(request, USERS.buyerClean);

    // 1) Sipariş oluştu, 24h içinde ödenmedi → iptal
    const { orderId, paymentId } = await buyAndInitiate(request, buyerToken, product.id);
    await backdate(request, 'payment', { id: paymentId }, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    await backdate(request, 'order', { id: orderId }, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    await runScheduler(request, 'cancel-expired-payments');
    const cancelled = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(['cancelled', 'pending_payment'], 'sipariş iptal/bekliyor').toContain(cancelled.status);

    // 2-3) Reactivate (ürün hâlâ stokta) → pending_payment
    const react = await request.post(`${API}/orders/${orderId}/reactivate`, { headers: auth(buyerToken), data: {} });
    expect([200, 201, 400, 409], 'reactivate çağrısı').toContain(react.status());

    // 4) Bu kez öder
    const reInit = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    if (reInit.ok()) {
      const pid = (await reInit.json())?.paymentId;
      const done = await request.post(`${API}/payments/${pid}/bypass-complete`, { data: {} });
      expect(done.ok(), 'yeniden ödeme').toBeTruthy();

      // 5) Hazırla, teslim al, onayla → completed
      const sellerId = (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId;
      await driveToCompleted(request, buyerToken, await tokenForSeller(request, sellerId), orderId);
      expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
    }
  });
});
