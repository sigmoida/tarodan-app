import * as request from 'supertest';
import {
  PaymentStatus,
  PaymentHoldStatus,
  PrismaClient,
  TradeStatus,
  ShipmentStatus,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import {
  createUser,
  createAdminUser,
  authHeader,
} from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { signCallback } from '../mocks/paytr.mock';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { PayoutService } from '../../src/modules/payout/payout.service';

/**
 * Wait for the post-accept fire-and-forget inbound dispatch to settle.
 */
async function waitForInboundShipments(
  prisma: PrismaClient,
  tradeId: string,
  expected = 2,
  timeoutMs = 4_000,
) {
  const deadline = Date.now() + timeoutMs;
  let rows = await prisma.tradeShipment.findMany({
    where: { tradeId, leg: 'to_warehouse' },
  });
  while (rows.length < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'to_warehouse' },
    });
  }
  return rows;
}

async function configureWarehouseAddress(addressId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.platformSetting.upsert({
    where: { settingKey: 'warehouse_address_id' },
    update: { settingValue: addressId },
    create: {
      settingKey: 'warehouse_address_id',
      settingValue: addressId,
      settingType: 'string',
    },
  });
}

/**
 * Money-flow tests answer the question: "where is the money RIGHT NOW?"
 * They walk an order/trade across each lifecycle boundary and assert the
 * Payment / PaymentHold / TradeCashPayment rows match the expected state.
 */

describe('Money Flow Timeline (E2E)', () => {
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

  describe('Order: pay → hold → confirm → release after window', () => {
    it('PaymentHold is held during fulfillment, released only after the cron fires past releaseAt', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true, premium: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      // Buy + initiate + callback
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);

      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      const cb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(cb);

      // T0: hold exists, status held, releaseAt set in the future
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(hold).toBeTruthy();
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releasedAt).toBeNull();
      // releaseAt ödeme anında NULL — yalnızca TESLİMDE hesaplanır (escrow güvenliği).
      expect(hold?.releaseAt).toBeNull();

      // T+release: confirm delivery (manual delivered transition for test brevity)
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: 'delivered', version: { increment: 1 } },
      });
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/confirm`)
        .set(authHeader(buyer))
        .expect(200);

      // Hold still held — confirm alone doesn't release.
      const holdAfterConfirm = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(holdAfterConfirm?.status).toBe(PaymentHoldStatus.held);
      expect(holdAfterConfirm?.releasedAt).toBeNull();

      // Force releaseAt into the past, run the cron
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const paymentService = ctx.app.get(PaymentService);
      const releaseResult = await paymentService.releaseHoldsDue();
      expect(releaseResult.count).toBeGreaterThanOrEqual(1);

      const holdReleased = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(holdReleased?.status).toBe(PaymentHoldStatus.released);
      expect(holdReleased?.releasedAt).toBeTruthy();

      // Verify: PayoutTransfer can be created for the released hold
      const payoutService = ctx.app.get(PayoutService);
      const payoutsCreated = await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);

      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.sellerId).toBe(seller.id);
      expect(Number(payout?.netAmount)).toBeGreaterThan(0);
    });
  });

  describe('Trade cash: escrowed during fulfilment, recipient paid only after both confirm + window', () => {
    it('completes a cash trade and only releases TradeCashPayment after holdReleaseAt passes', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
      const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);

      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShip = await createAddress({ userId: initiator.id, isDefault: false });
      const receiverShip = await createAddress({ userId: receiver.id, isDefault: false });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
        price: 100,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
        price: 200,
      });

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
      const tradeId = created.body.id;

      // Accept → awaiting_payment (TradeCashPayment created)
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      let cashPayment = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cashPayment?.status).toBe(PaymentStatus.pending);
      expect(cashPayment?.holdReleaseAt).toBeNull();

      // Initiate + callback success
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate-trade-cash')
        .set(authHeader(initiator))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cashPayment!.id },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);

      // Cash escrowed: completed but not released
      cashPayment = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cashPayment?.status).toBe(PaymentStatus.completed);
      expect(cashPayment?.holdReleaseAt).toBeNull();
      expect(cashPayment?.releasedAt).toBeNull();

      // Walk to completion: inbound shipments are auto-created by
      // PaymentService after cash success → admin receives → approve →
      // confirm both. Poll for the fire-and-forget dispatch to settle.
      void initiatorShip;
      void receiverShip;
      const incoming = await waitForInboundShipments(prisma, tradeId);
      for (const s of incoming) {
        await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/mark-warehouse-received`)
          .set(authHeader(admin))
          .send({ shipmentId: s.id })
          .expect(200);
      }
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/approve`)
        .set(authHeader(admin))
        .send({})
        .expect(200);
      const fromWarehouse = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'from_warehouse' },
      });
      for (const s of fromWarehouse) {
        await prisma.tradeShipment.update({
          where: { id: s.id },
          data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
        });
      }
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/confirm-receipt`)
        .set(authHeader(initiator))
        .send({})
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/confirm-receipt`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const tradeAfter = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAfter?.status).toBe(TradeStatus.completed);

      // After completion: holdReleaseAt set in the future, releasedAt still null
      cashPayment = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cashPayment?.holdReleaseAt).toBeTruthy();
      expect(cashPayment?.releasedAt).toBeNull();

      // Force holdReleaseAt past, run cron
      await prisma.tradeCashPayment.update({
        where: { id: cashPayment!.id },
        data: { holdReleaseAt: new Date(Date.now() - 1000) },
      });
      const paymentService = ctx.app.get(PaymentService);
      const result = await paymentService.releaseHoldsDue();
      expect(result.tradeCashReleased).toBeGreaterThanOrEqual(1);

      cashPayment = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cashPayment?.releasedAt).toBeTruthy();

      // Verify: PayoutTransfer can be created for the released trade cash
      const payoutService = ctx.app.get(PayoutService);
      const payoutsCreated = await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);

      const payout = await prisma.payoutTransfer.findFirst({
        where: { tradeCashPaymentId: cashPayment!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.sellerId).toBe(receiver.id);
    });
  });

  describe('Trade cash refund on cancellation', () => {
    it('refundTradeCashPaymentIfCompleted issues a PayTR refund and stamps refundedAt', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
      const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });
      const created = await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: ip.id, quantity: 1 }],
          receiverItems: [{ productId: rp.id, quantity: 1 }],
          cashAmount: 50,
        })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${created.body.id}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({
        where: { tradeId: created.body.id },
      });

      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate-trade-cash')
        .set(authHeader(initiator))
        .send({ tradeId: created.body.id })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cp!.id },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);

      const paymentService = ctx.app.get(PaymentService);
      const result = await paymentService.refundTradeCashPaymentIfCompleted(created.body.id);
      expect(result.refunded).toBe(true);

      const cpAfter = await prisma.tradeCashPayment.findUnique({
        where: { id: cp!.id },
      });
      expect(cpAfter?.refundedAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();

      // Mock PayTR recorded the refund call
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Order refund restores product stock', () => {
    it('processRefund cancels order, cancels hold, and re-stocks the product', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true, premium: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      // Buy + pay
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);
      const payment = await prisma.payment.findFirst({ where: { orderId: buyRes.body.orderId } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }));

      // Verify product stock decremented
      const productAfterPay = await prisma.product.findUnique({ where: { id: product.id } });
      expect(productAfterPay?.quantity).toBe(0);

      // Refund
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.processRefund(buyRes.body.orderId);

      // Order should be cancelled
      const orderAfter = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(orderAfter?.status).toBe('cancelled');

      // Hold should be cancelled
      const holdAfter = await prisma.paymentHold.findFirst({ where: { orderId: buyRes.body.orderId } });
      expect(holdAfter?.status).toBe(PaymentHoldStatus.cancelled);

      // PayTR refund was called
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Trade cash refund after admin warehouse rejection', () => {
    it('admin reject triggers PayTR refund for completed cash payment', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
      const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShip = await createAddress({ userId: initiator.id, isDefault: false });
      const receiverShip = await createAddress({ userId: receiver.id, isDefault: false });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
        price: 100,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
        price: 200,
      });

      // Create trade with cash, accept, pay
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
      const tradeId = created.body.id;

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate-trade-cash')
        .set(authHeader(initiator))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cp!.id } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }))
        .expect(200);

      // Inbound shipments auto-created post-cash-payment; poll for them.
      void initiatorShip;
      void receiverShip;
      const incoming = await waitForInboundShipments(prisma, tradeId);
      for (const s of incoming) {
        await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/mark-warehouse-received`)
          .set(authHeader(admin))
          .send({ shipmentId: s.id })
          .expect(200);
      }

      // Admin REJECTS
      ctx.paytr.reset(); // clear previous calls
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/reject`)
        .set(authHeader(admin))
        .send({ reason: 'Ürün hasarlı' })
        .expect(200);

      // Cash payment should be refunded
      const cpAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cpAfter?.refundedAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();

      // PayTR refund was called
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);

      // Trade should be returning or cancelled
      const tradeAfter = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(['returning', 'cancelled']).toContain(tradeAfter?.status);
    });
  });

  describe('Trade cash refund blocks future PayoutTransfer', () => {
    it('no PayoutTransfer is created after refund', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
      const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: ip.id, quantity: 1 }],
          receiverItems: [{ productId: rp.id, quantity: 1 }],
          cashAmount: 50,
        })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${created.body.id}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({ where: { tradeId: created.body.id } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate-trade-cash')
        .set(authHeader(initiator))
        .send({ tradeId: created.body.id })
        .expect(201);
      const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cp!.id } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }))
        .expect(200);

      // Refund the cash payment
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.refundTradeCashPaymentIfCompleted(created.body.id);

      // Try to create payouts — should create 0 (refunded, not released)
      const payoutService = ctx.app.get(PayoutService);
      const payoutsCreated = await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBe(0);

      // No PayoutTransfer should exist for this trade
      const payouts = await prisma.payoutTransfer.findMany({
        where: { tradeCashPaymentId: cp!.id },
      });
      expect(payouts.length).toBe(0);
    });
  });
});
