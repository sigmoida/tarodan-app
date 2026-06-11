/**
 * J129 — Tam tur 3: pazarlık, ödeme süresi dolması, tekrar deneme
 * Teklif → kabul → pending_payment sipariş → 30dk ödenmez (rezervasyon serbest) →
 * 24h içinde geri dönüp ödenir → hazırla/teslim/onay → tamamlanır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiFirstBuyableProduct } from '../support/helpers';
import { dbFind, backdate, runScheduler, expectDbEventually } from '../support/db';
import { auth, tokenForSeller, driveToCompleted } from '../support/journeys-extra';

test.describe('J129 — Pazarlık + ödeme timeout + tekrar deneme', () => {
  test('teklif kabul → timeout → geri dön → öde → tamamla', async ({ request }) => {
    test.setTimeout(90_000);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, me.id);

    // 1) Alıcı teklif verir (fiyat = kesin kabul); satıcı kabul eder → pending_payment sipariş
    const offer = await request.post(`${API}/offers`, {
      headers: auth(buyerToken),
      data: { productId: product.id, amount: Number(product.price), message: 'pazarlık' },
    });
    expect(offer.ok(), 'teklif').toBeTruthy();
    const offerId = (await offer.json())?.id;

    const sellerToken = await tokenForSeller(request, product.sellerId);
    const accept = await request.post(`${API}/offers/${offerId}/accept`, { headers: auth(sellerToken) });
    expect(accept.ok(), 'teklif kabul').toBeTruthy();

    const order = await expectDbEventually(request, 'order', { offerId }, (o) => !!o?.id, 8000);
    const orderId = order.id;
    expect(order.status).toBe('pending_payment');

    // Teklif siparişinde adres yok → ekle
    await request.patch(`${API}/orders/${orderId}/shipping-address`, {
      headers: auth(buyerToken),
      data: { fullName: 'Deniz Demo', phone: '+905551112233', city: 'İstanbul', district: 'Beşiktaş', address: 'Test Mah. 1. Sok No:5', zipCode: '34000' },
    });

    // 2-3) 30dk ödenmedi → initiate + backdate + cancel-expired-payments (rezervasyon serbest, sipariş yaşar)
    const init1 = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    const pay1 = (await init1.json())?.paymentId;
    await backdate(request, 'payment', { id: pay1 }, { createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString() });
    await runScheduler(request, 'cancel-expired-payments');
    expect((await dbFind(request, 'payment', { id: pay1 }, { status: true })).status).toBe('failed');
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('pending_payment');

    // 4) 24h içinde geri dönüp öder
    const init2 = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    if (!init2.ok()) expect(init2.ok(), `init2 (${init2.status()}) ${(await init2.text()).slice(0, 100)}`).toBeTruthy();
    const pay2 = (await init2.json())?.paymentId;
    const done = await request.post(`${API}/payments/${pay2}/bypass-complete`, { data: {} });
    if (!done.ok()) expect(done.ok(), `yeniden ödeme (${done.status()}) pay2=${pay2} ${(await done.text()).slice(0, 90)}`).toBeTruthy();

    // 5-6) Hazırla, teslim al, onayla → completed
    await driveToCompleted(request, buyerToken, sellerToken, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
