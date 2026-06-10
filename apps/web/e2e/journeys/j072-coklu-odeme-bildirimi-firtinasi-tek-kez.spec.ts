/**
 * J72 — Çoklu ödeme bildirimi fırtınası tek kez işleniyor
 * Aynı geçerli success callback PARALEL 3 kez gelir → sipariş tam bir kez kesinleşir
 * (tek payment, tek hold; çift sipariş/çift tahsilat yok).
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct, signPaytrCallback } from '../support/helpers';
import { dbFind, dbCount } from '../support/db';
import { buyAndInitiate } from '../support/journeys-extra';

// .env.test PayTR test anahtarları
const PAYTR_KEY = 'test-key';
const PAYTR_SALT = 'test-salt';

test.describe('J72 — Paralel callback fırtınası tek kez işlenir', () => {
  test('3 paralel success callback → tek payment, tek hold', async ({ request }) => {
    test.setTimeout(60_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Hemen Al + initiate (pending)
    const { orderId, paymentId, amount } = await buyAndInitiate(request, buyerToken, product.id);
    const totalKurus = Math.round(amount * 100);
    const cb = signPaytrCallback(orderId, 'success', totalKurus, PAYTR_KEY, PAYTR_SALT);

    // 2) Aynı geçerli success callback 3 kez PARALEL
    const results = await Promise.all([
      request.post(`${API}/payments/callback/paytr`, { form: cb }),
      request.post(`${API}/payments/callback/paytr`, { form: cb }),
      request.post(`${API}/payments/callback/paytr`, { form: cb }),
    ]);
    for (const r of results) expect(r.ok(), 'callback OK döner').toBeTruthy();

    // 3-4) Tam bir kez kesinleşti; çift payment/hold yok
    expect((await dbFind(request, 'payment', { id: paymentId }, { status: true })).status).toBe('completed');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toMatch(/paid|preparing/);
    expect(await dbCount(request, 'payment', { orderId }), 'tek payment').toBe(1);
    expect(await dbCount(request, 'paymentHold', { orderId }), 'tek hold (çift tahsilat yok)').toBe(1);
  });
});
