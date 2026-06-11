/**
 * J67 — İptal olmayan sipariş yeniden aktive edilemiyor
 * Aktif (ödenmiş) sipariş reactivate → reddedilir; olmayan id → 404; listeleme çalışır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay } from '../support/helpers';
import { dbFind } from '../support/db';
import { auth, tokenForSeller, driveToCompleted } from '../support/journeys-extra';

test.describe('J67 — İptal olmayan sipariş reactivate edilemez', () => {
  test('ödenmiş sipariş reactivate red, olmayan id 404, liste çalışır, sipariş tamamlanır', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Ödenmiş (aktif) sipariş
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);

    // Aktif siparişi reactivate → reddedilir (sadece iptal olanlar reaktive edilir)
    const react = await request.post(`${API}/orders/${orderId}/reactivate`, { headers: auth(buyerToken), data: {} });
    expect(react.ok(), 'aktif sipariş reactivate edilememeli').toBeFalsy();
    expect([400, 409]).toContain(react.status());

    // 2) Var olmayan sipariş id → 404
    const missing = await request.post(`${API}/orders/00000000-0000-0000-0000-000000000000/reactivate`, { headers: auth(buyerToken), data: {} });
    expect(missing.ok(), 'olmayan sipariş reactivate 404').toBeFalsy();
    expect([400, 403, 404]).toContain(missing.status());

    // 3) Siparişlerini listeler, durumlarını görür
    const list = await request.get(`${API}/orders`, { headers: auth(buyerToken) });
    expect(list.ok(), 'sipariş listesi').toBeTruthy();

    // 4) Mevcut siparişin teslimini bekler, onaylar → completed
    const sellerId = (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId;
    await driveToCompleted(request, buyerToken, await tokenForSeller(request, sellerId), orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
