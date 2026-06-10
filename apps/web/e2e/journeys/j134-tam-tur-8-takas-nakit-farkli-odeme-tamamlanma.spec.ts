/**
 * J134 — Tam tur 8: takas nakit farklı, ödeme, tamamlanma, puan
 * Nakit farklı takas → kabul=awaiting_payment → fark ödenir (escrow) → depo akışı →
 * karşılıklı teslim → completed → süre dolunca nakit alacaklıya aktarılır → puanlama.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe } from '../support/helpers';
import { dbFind, dbCount, backdate, runScheduler, expectDbEventually } from '../support/db';
import {
  auth, adminToken, anyCategoryId, createActiveProduct, getTradeRow,
  deliverBothLegsToWarehouse, confirmBothRecipientLegs,
} from '../support/journeys-extra';

test.describe('J134 — Nakit farklı takas: ödeme → tamamlanma → puan', () => {
  test('nakit teklif → kabul=awaiting_payment → öde → depo → tamamla → hold release → puan', async ({ request }) => {
    test.setTimeout(120_000);
    const tokenA = await apiLogin(request, USERS.sellerPremium);
    const tokenB = await apiLogin(request, USERS.sellerBusiness);
    const adminTok = await adminToken(request);
    const A = await apiMe(request, tokenA);
    const B = await apiMe(request, tokenB);
    const categoryId = await anyCategoryId(request);

    const prodA = await createActiveProduct(request, tokenA, adminTok, categoryId, { price: 1500, tradeEnabled: true, title: 'A J134' });
    const prodB = await createActiveProduct(request, tokenB, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'B J134' });

    // 1) A, +500 nakit fark teklif eder
    const create = await request.post(`${API}/trades`, {
      headers: auth(tokenA),
      data: {
        receiverId: B.id,
        initiatorItems: [{ productId: prodA.id, quantity: 1 }],
        receiverItems: [{ productId: prodB.id, quantity: 1 }],
        cashAmount: 500,
        message: 'üstüne 500',
      },
    });
    expect(create.ok(), 'nakit takas oluştur').toBeTruthy();
    const tradeId = (await create.json())?.id;

    // 2) B kabul → awaiting_payment (depo kargosu henüz yok)
    const accept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(tokenB), data: {} });
    expect(accept.ok(), 'kabul').toBeTruthy();
    expect((await getTradeRow(request, tradeId, { status: true })).status).toBe('awaiting_payment');
    expect(await dbCount(request, 'tradeShipment', { tradeId, leg: 'to_warehouse' })).toBe(0);

    // 3) A nakit farkı öder (escrow)
    const init = await request.post(`${API}/trades/${tradeId}/cash-payment/initiate`, { headers: auth(tokenA), data: {} });
    expect(init.ok(), 'cash initiate').toBeTruthy();
    const paymentId = (await init.json())?.paymentId;
    const done = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(done.ok(), 'cash bypass-complete').toBeTruthy();
    await expectDbEventually(request, 'trade', { id: tradeId }, (r) => r?.status === 'shipping_to_warehouse', 10_000);

    // 4) Depo akışı: bacaklar teslim → admin onay → karşılıklı teslim → completed
    await deliverBothLegsToWarehouse(request, adminTok, tradeId);
    const approve = await request.post(`${API}/admin/trades/${tradeId}/approve`, { headers: auth(adminTok), data: {} });
    expect(approve.ok(), 'admin onay').toBeTruthy();
    await confirmBothRecipientLegs(request, tradeId, tokenA, tokenB); // initiator=A, receiver=B
    expect((await getTradeRow(request, tradeId, { status: true })).status).toBe('completed');

    // 5) Süre dolunca nakit alacaklıya aktarılır
    await backdate(request, 'tradeCashPayment', { tradeId }, { holdReleaseAt: new Date(Date.now() - 60_000).toISOString() });
    await runScheduler(request, 'release-holds-due');
    await expectDbEventually(request, 'tradeCashPayment', { tradeId }, (r) => r?.releasedAt != null, 10_000);

    // 6) Taraflar birbirini puanlar (tradeId ile)
    const rAB = await request.post(`${API}/ratings/users`, { headers: auth(tokenA), data: { receiverId: B.id, tradeId, score: 5, comment: 'temiz takas' } });
    expect(rAB.ok(), 'A→B puan').toBeTruthy();
    const rBA = await request.post(`${API}/ratings/users`, { headers: auth(tokenB), data: { receiverId: A.id, tradeId, score: 5 } });
    expect(rBA.ok(), 'B→A puan').toBeTruthy();
    expect(await dbCount(request, 'rating', { tradeId })).toBeGreaterThanOrEqual(2);
  });
});
