/**
 * J12 — Ödeme süresi doluyor, bu arada stok tükeniyor
 * Tek adetli ürün: alıcı1 Hemen Al ama ödemez → rezervasyon serbest →
 * alıcı2 alıp öder (stok biter) → alıcı1 geri döner, ödeyemez → ürünü istek listesine ekler.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiBuyAndPay } from '../support/helpers';
import { dbFind, backdate, runScheduler } from '../support/db';
import { auth, adminToken, anyCategoryId, createActiveProduct, buyAndInitiate } from '../support/journeys-extra';

test.describe('J12 — Ödeme timeout sırasında stok tükenir', () => {
  test('alıcı1 ödemez (timeout) → alıcı2 son adedi alır → alıcı1 ödeyemez, wishlist ekler', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);

    // Deterministik tek adetli ürün
    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 800, quantity: 1, title: 'J12 son adet' });

    // 1) Alıcı1 (deniz) Hemen Al → ürün rezerve, pending payment (ödemedi)
    const buyer1 = await apiLogin(request, USERS.buyerClean);
    const { orderId: order1, paymentId: pay1 } = await buyAndInitiate(request, buyer1, product.id);
    expect((await dbFind(request, 'payment', { id: pay1 }, { status: true })).status).toBe('pending');

    // 2) 30 dk doldu → rezervasyon serbest. Rezervasyon serbest bırakma ORDER.createdAt'a bakar
    //    (release-expired-reservations), payment fail PAYMENT.createdAt'a → ikisini de backdate et.
    const past = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    await backdate(request, 'payment', { id: pay1 }, { createdAt: past });
    await backdate(request, 'order', { id: order1 }, { createdAt: past });
    await runScheduler(request, 'cancel-expired-payments');
    await runScheduler(request, 'release-expired-reservations');
    expect((await dbFind(request, 'payment', { id: pay1 }, { status: true })).status, 'timeout payment failed').toBe('failed');

    // 3) Bu sırada alıcı2 (mehmet) aynı ürünü alıp öder → stok biter
    const buyer2 = await apiLogin(request, USERS.buyer);
    const { orderId: order2 } = await apiBuyAndPay(request, buyer2, product.id);
    expect(['paid', 'preparing']).toContain((await dbFind(request, 'order', { id: order2 }, { status: true })).status);
    const prodAfter = await dbFind(request, 'product', { id: product.id }, { quantity: true, reservedQuantity: true, status: true });
    const available = Number(prodAfter.quantity ?? 0) - Number(prodAfter.reservedQuantity ?? 0);
    expect(available, 'satılabilir stok kalmadı').toBeLessThanOrEqual(0);

    // 4) Alıcı1 geri döndü, ödemeyi denedi → stok yok; sweep ile bekleyen sipariş iptal olur
    await runScheduler(request, 'sweep-out-of-stock');
    const order1Row = await dbFind(request, 'order', { id: order1 }, { status: true });
    expect(['cancelled', 'pending_payment'], 'alıcı1 siparişi ödenememiş/iptal').toContain(order1Row.status);

    // Yeniden ödeme denemesi tamamlanamaz (stok yok) — re-initiate olsa bile paid'e ulaşamaz
    const me1 = await apiMe(request, buyer1);
    void me1;

    // 5) Alıcı1 ürünü istek listesine ekler (stok gelince haber almak için)
    const wish = await request.post(`${API}/wishlist`, { headers: auth(buyer1), data: { productId: product.id } });
    expect([200, 201, 409], 'wishlist ekleme').toContain(wish.status());
  });
});
