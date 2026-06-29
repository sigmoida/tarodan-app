import * as request from 'supertest';
import { PaymentStatus, TradeStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { signCallback } from '../mocks/paytr.mock';

/**
 * Karşı-ödemeli (nakit farklı) takas iptal edildiğinde ödenen paranın
 * otomatik iade edilip edilmediğini KANITLAR. Kullanıcı sorusu: "karşı ödemeli
 * takas ise, iptal ettiğimizde direk para iadesi de oluyor mu?"
 */
describe('Trade cash cancel → auto refund (E2E)', () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
  });

  it('paid cash trade cancelled before shipping → full PayTR refund to payer + reservations released', async () => {
    const prisma = getPrisma();
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    const ip = await createProduct({
      sellerId: initiator.id, categoryId: baseline.categoryId, isTradeEnabled: true, price: 200, quantity: 1,
    });
    const rp = await createProduct({
      sellerId: receiver.id, categoryId: baseline.categoryId, isTradeEnabled: true, price: 200, quantity: 1,
    });
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });

    // 1) Cash trade (initiator pays 100) → accept → awaiting_payment
    const created = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
        cashAmount: 100,
      })
      .expect(201);
    const tradeId: string = created.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);

    // After accept both products are reserved.
    const ipRes = await prisma.product.findUnique({ where: { id: ip.id } });
    const rpRes = await prisma.product.findUnique({ where: { id: rp.id } });
    expect(ipRes?.reservedQuantity).toBe(1);
    expect(rpRes?.reservedQuantity).toBe(1);

    // 2) Pay the cash → escrowed, trade → shipping_to_warehouse
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate-trade-cash')
      .set(authHeader(initiator))
      .send({ tradeId })
      .expect(201);
    const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cashBefore!.id } });
    const cb = signCallback({
      merchantOid: payment!.providerConversationId!,
      status: 'success',
      totalAmount: Math.round(Number(payment!.amount) * 100),
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(cb)
      .expect(200);

    const cashAfterPay = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfterPay?.status).toBe(PaymentStatus.completed);
    expect(cashAfterPay?.releasedAt).toBeNull(); // escrowed, not yet released to recipient
    expect(ctx.paytr.refundCalls).toHaveLength(0); // no refund yet

    // 3) Cancel the trade before anyone hands items to cargo (still cancellable window).
    await request(ctx.app.getHttpServer())
      .post(`/api/trades/${tradeId}/cancel`)
      .set(authHeader(initiator))
      .send({ reason: 'vazgeçtik' })
      .expect(201);

    // 4) PROOF: money auto-refunded to payer, full amount (product + commission).
    expect(ctx.paytr.refundCalls).toHaveLength(1);
    const expectedAmount = Number(cashAfterPay!.totalAmount ?? payment!.amount);
    expect(ctx.paytr.refundCalls[0].refundAmount).toBe(expectedAmount);

    const cashAfterCancel = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfterCancel?.refundedAt).not.toBeNull();

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);

    // Reservations on BOTH products released.
    const ipAfter = await prisma.product.findUnique({ where: { id: ip.id } });
    const rpAfter = await prisma.product.findUnique({ where: { id: rp.id } });
    expect(ipAfter?.reservedQuantity).toBe(0);
    expect(rpAfter?.reservedQuantity).toBe(0);
  });
});
