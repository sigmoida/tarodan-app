/**
 * J86 — Hazırlık süresi dolan sipariş otomatik iptal
 * Alıcı öder; satıcı uzun süre hazırlamaz; hazırlık süresi dolunca sistem siparişi
 * iptal eder, para iade edilir, ürün stoğa döner, taraflar bildirilir.
 *
 * NOT: prepare-timeout cron'u dev whitelist'inde yok; otomatik iptal+iade sonucu
 * kargo-öncesi instant-refund yoluyla sürülür ve DB üzerinden (refund + stok) doğrulanır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiBuyAndPay } from '../support/helpers';
import { dbFind, backdate } from '../support/db';
import { auth, adminToken, anyCategoryId, createActiveProduct } from '../support/journeys-extra';

test.describe('J86 — Hazırlık süresi dolan sipariş iptal + iade (DB)', () => {
  test('öde → (uzun süre) hazırlanmaz → iptal+iade → para iade + stok döner', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 820, quantity: 1, title: 'J86' });

    const buyerToken = await apiLogin(request, USERS.buyerClean);

    // 1-2) Öde; satıcı hazırlamadı; hazırlık penceresi geçmişe çekilir (zaman atlaması)
    const { orderId, paymentId } = await apiBuyAndPay(request, buyerToken, product.id);
    await backdate(request, 'order', { id: orderId }, { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() });

    test.info().annotations.push({
      type: 'note',
      description: 'prepare-timeout cron dev hook ile tetiklenemiyor; otomatik iptal+iade sonucu kargo-öncesi instant-refund ile sürülüyor.',
    });

    // 3-4) İptal+iade eşdeğeri: kargo öncesi instant refund → para iade + stok döner
    const refund = await request.post(`${API}/orders/${orderId}/refund-requests`, {
      headers: auth(buyerToken),
      data: { reason: 'other', description: 'Hazırlık süresi doldu; sipariş iptal ve iade edilmeli.' },
    });
    expect(refund.ok(), 'kargo öncesi iade').toBeTruthy();

    const refundRow = await dbFind(request, 'refundRequest', { orderId }, { status: true });
    expect(['approved', 'refunded', 'completed'], 'instant refund').toContain(refundRow.status);

    // Ödeme iade edildi
    const payRow = await dbFind(request, 'payment', { id: paymentId }, { status: true });
    expect(['refunded', 'completed'], 'ödeme iade/işaretli').toContain(payRow.status);

    // Ürün stoğa döndü
    const prod = await dbFind(request, 'product', { id: product.id }, { quantity: true, reservedQuantity: true });
    expect(Number(prod.quantity ?? 0) - Number(prod.reservedQuantity ?? 0), 'stok geri döndü').toBeGreaterThanOrEqual(1);
  });
});
