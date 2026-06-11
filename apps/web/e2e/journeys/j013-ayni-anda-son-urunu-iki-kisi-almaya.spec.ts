/**
 * J13 — Aynı anda son ürünü iki kişi almaya çalışıyor
 * Tek adetli ürün: bir alıcı kazanır+öder, diğeri 'stok yok' alır; üründeki bekleyen
 * teklif sweep ile otomatik iptal olur; kazanan teslim alıp onaylar.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiBuyAndPay } from '../support/helpers';
import { dbFind, runScheduler } from '../support/db';
import {
  auth, adminToken, anyCategoryId, createActiveProduct, tokenForSeller, driveToCompleted,
} from '../support/journeys-extra';

test.describe('J13 — Son adet yarışı: biri kazanır, biri stok yok', () => {
  test('alıcı1 son adedi alır, alıcı2 reddedilir, bekleyen teklif iptal olur, kazanan tamamlar', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const seller = await apiMe(request, sellerToken);

    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 900, quantity: 1, title: 'J13 son adet' });

    // Üçüncü kullanıcı (ceren) ürüne bekleyen teklif verir
    const offerorToken = await apiLogin(request, USERS.newMember);
    const offer = await request.post(`${API}/offers`, {
      headers: auth(offerorToken),
      data: { productId: product.id, amount: Number(product.price) * 0.8, message: 'teklif' },
    });
    expect(offer.ok(), 'bekleyen teklif oluştu').toBeTruthy();
    const offerId = (await offer.json())?.id;

    // 1-2-3) Alıcı1 (deniz) son adedi alıp öder (kazanan)
    const buyer1 = await apiLogin(request, USERS.buyerClean);
    const { orderId } = await apiBuyAndPay(request, buyer1, product.id);
    expect(['paid', 'preparing']).toContain((await dbFind(request, 'order', { id: orderId }, { status: true })).status);

    // 4) Alıcı2 (mehmet) aynı ürünü almaya çalışır → stok yok (orders/buy reddedilir)
    const buyer2 = await apiLogin(request, USERS.buyer);
    const buy2 = await request.post(`${API}/orders/buy`, {
      headers: auth(buyer2),
      data: { productId: product.id, shippingAddressId: undefined },
    });
    expect(buy2.ok(), 'ikinci alıcı stok yok').toBeFalsy();
    expect([400, 404, 409]).toContain(buy2.status());

    // 5-6) Üründeki bekleyen teklif otomatik iptal olur (sweep-out-of-stock)
    await runScheduler(request, 'sweep-out-of-stock');
    if (offerId) {
      const offerRow = await dbFind(request, 'offer', { id: offerId }, { status: true });
      expect(['cancelled', 'rejected', 'expired'], 'bekleyen teklif iptal').toContain(offerRow.status);
    }

    // 7) Kazanan teslim alır, onaylar → completed
    const ownerSeller = await tokenForSeller(request, seller.id);
    await driveToCompleted(request, buyer1, ownerSeller, orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
