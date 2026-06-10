/**
 * J61 — Stoğu biten ürünü almaya çalışma
 * Stoğu 0'a çekilen ürün: Hemen Al reddedilir → istek listesine eklenir →
 * stok geri gelince satın alınır, teslim alınır.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiBuyAndPay } from '../support/helpers';
import { dbFind, backdate } from '../support/db';
import {
  auth, adminToken, anyCategoryId, createActiveProduct, tokenForSeller, driveToCompleted,
} from '../support/journeys-extra';

test.describe('J61 — Stoğu biten ürün: önce red, sonra stok gelince alınır', () => {
  test('stok 0 → Hemen Al red → wishlist → stok geri → satın al → teslim al', async ({ request }) => {
    test.setTimeout(90_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerFree);

    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 700, quantity: 1, title: 'J61 stok' });
    // Stoğu tüket (quantity 0)
    await backdate(request, 'product', { id: product.id }, { quantity: 0 });

    const buyerToken = await apiLogin(request, USERS.buyerClean);

    // 1) Stoğu tükenmiş ürünü Hemen Al → reddedilir
    const buy = await request.post(`${API}/orders/buy`, {
      headers: auth(buyerToken),
      data: { productId: product.id },
    });
    expect(buy.ok(), 'stoksuz Hemen Al reddedilmeli').toBeFalsy();
    expect([400, 404, 409]).toContain(buy.status());

    // 2) Ürünü istek listesine ekle
    const wish = await request.post(`${API}/wishlist`, { headers: auth(buyerToken), data: { productId: product.id } });
    expect([200, 201, 409], 'wishlist ekleme').toContain(wish.status());

    // 3) Stok geri geldi (satıcı yeniden stok ekledi)
    await backdate(request, 'product', { id: product.id }, { quantity: 1, status: 'active' });
    expect((await dbFind(request, 'product', { id: product.id }, { quantity: true })).quantity).toBe(1);

    // 4) Ürünü satın al, öde, teslim al
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    const sellerId = (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId;
    await driveToCompleted(request, buyerToken, await tokenForSeller(request, sellerId), orderId);
    expect((await dbFind(request, 'order', { id: orderId }, { status: true })).status).toBe('completed');
  });
});
