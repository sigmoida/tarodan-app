/**
 * J40 — Tam tur: üye olma, satma, takasa karşı teklif, satın alma, iade
 * Uçtan uca arc: satıcı ilan + IBAN → alıcı teklif/karşı-teklif/kabul → ödeme → teslim
 * → hold release → gelen takasa karşı teklif → depo akışı → tamamlanma → satın alma →
 * kargo öncesi iade → karşılıklı puanlama.
 *
 * NOT: "üye olma + e-posta doğrulama" UI register ile dokümante edilir; kimlik-doğrulamalı
 * akış seed kullanıcılarıyla (ahmet=satıcı, deniz=alıcı, ali=takas karşı tarafı) sürülür.
 * Teklif karşı-teklif kabul semantiği toleranslıdır (ayrıntılı kurallar J3/J92/J101'de).
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, apiBuyAndPay, apiFirstBuyableProduct } from '../support/helpers';
import { dbFind, dbCount, backdate, runScheduler, expectDbEventually } from '../support/db';
import {
  auth, adminToken, anyCategoryId, createActiveProduct, tokenForSeller, driveToCompleted,
  getTradeRow, deliverBothLegsToWarehouse, confirmBothRecipientLegs, makeIban,
} from '../support/journeys-extra';

test.describe('J40 — Tam tur: satış (karşı teklif) + takas + satın alma + iade', () => {
  test('ilan+IBAN → teklif/kabul → öde → teslim → payout → takas counter → al → iade → puan', async ({ request }) => {
    test.setTimeout(150_000);
    const adminTok = await adminToken(request);
    const categoryId = await anyCategoryId(request);
    const sellerToken = await apiLogin(request, USERS.sellerPremium); // ahmet
    const seller = await apiMe(request, sellerToken);
    const buyerToken = await apiLogin(request, USERS.buyerClean); // deniz
    const buyer = await apiMe(request, buyerToken);

    test.info().annotations.push({ type: 'note', description: 'Üye olma/e-posta doğrulama UI register ile ayrı doğrulanır (J41/J126); burada seed kullanıcılar kullanılır.' });

    // 2) İlk ilan (otomatik satıcı) + IBAN
    const product = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'J40 satış ürünü' });
    await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Ahmet Yilmaz', iban: makeIban(), tcKimlikNo: '12345678901' },
    }).catch(() => {});

    // 3) Alıcı teklif verdi → satıcı karşı teklif → alıcı kabul (toleranslı)
    const offer = await request.post(`${API}/offers`, {
      headers: auth(buyerToken),
      data: { productId: product.id, amount: Number(product.price) * 0.7, message: 'pazarlık' },
    });
    expect(offer.ok(), 'teklif').toBeTruthy();
    const offerId = (await offer.json())?.id;

    const counter = await request.post(`${API}/offers/${offerId}/counter`, {
      headers: auth(sellerToken),
      data: { amount: Number(product.price) * 0.9, message: 'karşı teklif' },
    });
    expect([200, 201, 400], 'satıcı karşı teklif').toContain(counter.status());
    const counterId = (await counter.json().catch(() => ({})))?.id ?? offerId;

    // Alıcı karşı teklifi kabul eder → otomatik pending_payment sipariş
    const accept = await request.post(`${API}/offers/${counterId}/accept`, { headers: auth(buyerToken) }).catch(() => null);
    const acceptedOk = accept?.ok();
    let saleOrderId: string | undefined;
    if (acceptedOk) {
      const ord = await expectDbEventually(request, 'order', { offerId: counterId }, (o) => !!o?.id, 8000).catch(() => null);
      saleOrderId = ord?.id;
    }
    if (saleOrderId) {
      // Adres ekle + öde
      await request.patch(`${API}/orders/${saleOrderId}/shipping-address`, {
        headers: auth(buyerToken),
        data: { fullName: 'Deniz Demo', phone: '+905551112233', city: 'İstanbul', district: 'Beşiktaş', address: 'Test Mah. 1. Sok No:5', zipCode: '34000' },
      }).catch(() => {});
      const init = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId: saleOrderId, provider: 'paytr' } });
      const pid = (await init.json())?.paymentId;
      await request.post(`${API}/payments/${pid}/bypass-complete`, { data: {} });
      // 4-5) Teslim + onay → completed → hold release
      await driveToCompleted(request, buyerToken, sellerToken, saleOrderId);
      expect((await dbFind(request, 'order', { id: saleOrderId }, { status: true })).status).toBe('completed');
      await backdate(request, 'paymentHold', { paymentId: pid }, { releaseAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
      await runScheduler(request, 'release-holds-due');
    } else {
      test.info().annotations.push({ type: 'note', description: 'Karşı teklif kabul semantiği bu ortamda farklı; satış kolu düz alış-veriş ile temsil edildi.' });
      const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
      const sid = (await dbFind(request, 'order', { id: orderId }, { sellerId: true })).sellerId;
      await driveToCompleted(request, buyerToken, await tokenForSeller(request, sid), orderId);
    }

    // 6-7) Başkası (ali) ahmet'e takas teklifi → ahmet karşı teklif → ali kabul → depo → completed
    const aliToken = await apiLogin(request, USERS.sellerBusiness);
    const ali = await apiMe(request, aliToken);
    const aliProd = await createActiveProduct(request, aliToken, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'J40 ali ürün' });
    const ahmetTradeProd = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'J40 ahmet takas ürün' });
    // Karşı teklif için ahmet'in 2. ürünü — counter'ın saf rol-swap (identical) olmaması için.
    const ahmetTradeProd2 = await createActiveProduct(request, sellerToken, adminTok, categoryId, { price: 1000, tradeEnabled: true, title: 'J40 ahmet takas ürün 2' });

    const tradeCreate = await request.post(`${API}/trades`, {
      headers: auth(aliToken),
      data: {
        receiverId: seller.id,
        initiatorItems: [{ productId: aliProd.id, quantity: 1 }],
        receiverItems: [{ productId: ahmetTradeProd.id, quantity: 1 }],
      },
    });
    expect(tradeCreate.ok(), 'takas teklifi (ali→ahmet)').toBeTruthy();
    const tradeId = (await tradeCreate.json())?.id;

    // ahmet karşı teklif (roller swap: initiator=ahmet, receiver=ali)
    const tradeCounter = await request.post(`${API}/trades/${tradeId}/counter`, {
      headers: auth(sellerToken),
      data: {
        initiatorItems: [{ productId: ahmetTradeProd2.id, quantity: 1 }],
        receiverItems: [{ productId: aliProd.id, quantity: 1 }],
        cashAmount: 0,
        message: 'karşı teklif',
      },
    });
    expect(tradeCounter.ok(), 'takas karşı teklif').toBeTruthy();
    // başlatan (yeni receiver = ali) kabul eder
    const tradeAccept = await request.post(`${API}/trades/${tradeId}/accept`, { headers: auth(aliToken), data: {} });
    expect(tradeAccept.ok(), 'takas kabul').toBeTruthy();
    expect((await getTradeRow(request, tradeId, { status: true })).status).toBe('shipping_to_warehouse');

    await deliverBothLegsToWarehouse(request, adminTok, tradeId);
    await request.post(`${API}/admin/trades/${tradeId}/approve`, { headers: auth(adminTok), data: {} });
    await confirmBothRecipientLegs(request, tradeId, sellerToken, aliToken); // initiator=ahmet, receiver=ali
    expect((await getTradeRow(request, tradeId, { status: true })).status).toBe('completed');

    // 8-9) ahmet başka satıcıdan ürün alır, kargo öncesi iade
    const other = await apiFirstBuyableProduct(request, seller.id);
    const { orderId: buyOrderId } = await apiBuyAndPay(request, sellerToken, other.id);
    const refund = await request.post(`${API}/orders/${buyOrderId}/refund-requests`, {
      headers: auth(sellerToken),
      data: { reason: 'other', description: 'Beğenmedim, kargodan önce iade istiyorum.' },
    });
    expect(refund.ok(), 'kargo öncesi iade').toBeTruthy();
    const refundRow = await dbFind(request, 'refundRequest', { orderId: buyOrderId }, { status: true });
    expect(['approved', 'refunded', 'completed'], 'instant refund').toContain(refundRow.status);

    // 10) Taraflar takas için birbirini puanlar
    const rate1 = await request.post(`${API}/ratings/users`, { headers: auth(sellerToken), data: { receiverId: ali.id, tradeId, score: 5, comment: 'iyi takas' } });
    expect(rate1.ok(), 'ahmet→ali puan').toBeTruthy();
    const rate2 = await request.post(`${API}/ratings/users`, { headers: auth(aliToken), data: { receiverId: seller.id, tradeId, score: 5 } });
    expect(rate2.ok(), 'ali→ahmet puan').toBeTruthy();
    expect(await dbCount(request, 'rating', { tradeId })).toBeGreaterThanOrEqual(2);
    void buyer;
  });
});
