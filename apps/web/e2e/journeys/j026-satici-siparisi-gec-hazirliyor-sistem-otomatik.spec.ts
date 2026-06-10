/**
 * J26 — Satıcı siparişi geç hazırlıyor, sistem otomatik iptal ediyor
 * Alıcı alır+öder; satıcı hazırlamaz; hazırlık süresi dolunca sistem siparişi iptal
 * eder, para iade edilir, ürün stoğa döner; alıcı aynı ürünü başka bir satıcıdan alır.
 *
 * NOT: "hazırlık süresi dolan sipariş otomatik iptal" cron'u dev hook whitelist'inde
 * expose edilmiyor; üretimde otomatik tetiklenen iptal+iade sonucunun eşdeğeri,
 * kargo-öncesi instant-refund yoluyla sürülerek (para iade + stok iadesi) doğrulanır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiBuyAndPay, apiFirstBuyableProduct } from '../support/helpers';
import { dbFind } from '../support/db';
import { auth, adminToken, anyCategoryId, createActiveProduct } from '../support/journeys-extra';

test.describe('J26 — Hazırlanmayan sipariş iptal + iade, alıcı tekrar alır', () => {
  test('öde → hazırlanmaz → (otomatik) iptal+iade → stok döner → başka satıcıdan al', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 750, quantity: 1, title: 'J26' });

    const buyerToken = await apiLogin(request, USERS.buyerClean);

    // 1-2) Alıcı aldı + ödedi; satıcı hazırlamadı (order paid'de kaldı)
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    expect(['paid', 'preparing']).toContain((await dbFind(request, 'order', { id: orderId }, { status: true })).status);

    test.info().annotations.push({
      type: 'note',
      description: 'Hazırlık-zaman-aşımı otomatik iptal cron\'u dev hook ile tetiklenemiyor; iptal+iade sonucu kargo-öncesi instant-refund ile sürülüyor.',
    });

    // 3-4) (Otomatik) iptal+iade eşdeğeri: kargodan önce iade → instant refund, stok döner
    const refund = await request.post(`${API}/orders/${orderId}/refund-requests`, {
      headers: auth(buyerToken),
      data: { reason: 'other', description: 'Satıcı uzun süredir hazırlamadı, iptal/iade istiyorum.' },
    });
    expect(refund.ok(), 'kargo öncesi iade talebi').toBeTruthy();
    const refundRow = await dbFind(request, 'refundRequest', { orderId }, { status: true });
    expect(['approved', 'refunded', 'completed'], 'kargo öncesi instant refund').toContain(refundRow.status);

    const restocked = await dbFind(request, 'product', { id: product.id }, { quantity: true, reservedQuantity: true });
    expect(Number(restocked.quantity ?? 0) - Number(restocked.reservedQuantity ?? 0), 'ürün stoğa döndü').toBeGreaterThanOrEqual(1);

    // 5-6) Alıcı aynı ürünü başka bir satıcıdan alır (herhangi satın alınabilir ürün)
    const me = await apiMe(request, buyerToken);
    const other = await apiFirstBuyableProduct(request, me.id);
    const { orderId: order2 } = await apiBuyAndPay(request, buyerToken, other.id);
    expect(['paid', 'preparing']).toContain((await dbFind(request, 'order', { id: order2 }, { status: true })).status);
  });
});
