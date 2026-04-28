import * as request from 'supertest';
import {
  PaymentStatus,
  PaymentHoldStatus,
  PayoutStatus,
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
import { TradeSchedulerService } from '../../src/modules/trade/trade-scheduler.service';

async function configureWarehouseAddress(addressId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.platformSetting.upsert({
    where: { settingKey: 'warehouse_address_id' },
    update: { settingValue: addressId },
    create: { settingKey: 'warehouse_address_id', settingValue: addressId, settingType: 'string' },
  });
}

/**
 * Tests for auto-confirm timeout and race conditions in the escrow system.
 */
describe('Escrow Edge Cases (E2E)', () => {
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

  describe('Auto-confirm expired receipts', () => {
    it('auto-completes a trade when confirmationDeadline passes without user confirmation', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
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
        price: 200,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
        price: 200,
      });

      // Create + accept (no cash)
      const created = await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: ip.id, quantity: 1 }],
          receiverItems: [{ productId: rp.id, quantity: 1 }],
        })
        .expect(201);
      const tradeId = created.body.id;

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      // Ship to warehouse
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(initiator))
        .send({ fromAddressId: initiatorShip.id, carrier: 'Sürat' })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(receiver))
        .send({ fromAddressId: receiverShip.id, carrier: 'Sürat' })
        .expect(201);

      const prisma = getPrisma();

      // Admin receives + approves
      const incoming = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
      });
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

      // Force shipments to delivered
      const fromWarehouse = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'from_warehouse' },
      });
      for (const s of fromWarehouse) {
        await prisma.tradeShipment.update({
          where: { id: s.id },
          data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
        });
      }

      // Trade is shipping_to_recipients — nobody confirms
      const tradeBefore = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeBefore?.status).toBe(TradeStatus.shipping_to_recipients);

      // Force confirmationDeadline into the past
      await prisma.trade.update({
        where: { id: tradeId },
        data: { confirmationDeadline: new Date(Date.now() - 1000) },
      });

      // Run the scheduler
      const tradeScheduler = ctx.app.get(TradeSchedulerService);
      await tradeScheduler.handleExpiredTrades();

      // Trade should be auto-completed
      const tradeAfter = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAfter?.status).toBe(TradeStatus.completed);
      expect(tradeAfter?.completedAt).toBeTruthy();

      // All from_warehouse shipments should be confirmed
      const shipmentsAfter = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'from_warehouse' },
      });
      for (const s of shipmentsAfter) {
        expect(s.confirmedAt).toBeTruthy();
      }
    });
  });

  describe('Race condition: release + refund', () => {
    it('blocks refund when payout is already in progress', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 400,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: 'Seller',
          iban: 'TR330006100519786457841326',
        },
      });

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
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }));

      // Release hold
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();

      // Create payout + process it (mark as completed)
      const payoutService = ctx.app.get(PayoutService);
      await payoutService.createPayoutsForReleasedHolds();
      await payoutService.processPendingPayouts();

      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout?.status).toBe(PayoutStatus.completed);

      // Now try to refund — should fail because payout is already completed
      const paymentService = ctx.app.get(PaymentService);
      await expect(
        paymentService.processRefund(buyRes.body.orderId),
      ).rejects.toThrow(/transfer zaten başlatılmış/i);
    });

    it('does not create duplicate PayoutTransfer when releaseHoldsDue runs twice', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: 'Seller',
          iban: 'TR330006100519786457841326',
        },
      });

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
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }));

      // Release hold
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });

      const paymentService = ctx.app.get(PaymentService);
      const payoutService = ctx.app.get(PayoutService);

      // Run release + payout creation TWICE
      await paymentService.releaseHoldsDue();
      await payoutService.createPayoutsForReleasedHolds();
      await payoutService.createPayoutsForReleasedHolds(); // second time

      // Should still have only 1 PayoutTransfer
      const payouts = await prisma.payoutTransfer.findMany({
        where: { paymentHoldId: hold!.id },
      });
      expect(payouts.length).toBe(1);
    });
  });

  describe('Auto-confirm with cash hold', () => {
    it('auto-confirm on cash trade sets holdReleaseAt after completion', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShip = await createAddress({ userId: initiator.id, isDefault: false });
      const receiverShip = await createAddress({ userId: receiver.id, isDefault: false });

      const prisma = getPrisma();

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

      // Ship to warehouse, admin receives + approves
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(initiator))
        .send({ fromAddressId: initiatorShip.id, carrier: 'Sürat' })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(receiver))
        .send({ fromAddressId: receiverShip.id, carrier: 'Sürat' })
        .expect(201);

      const incoming = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'to_warehouse' } });
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

      // Force shipments delivered
      const fromWarehouse = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'from_warehouse' } });
      for (const s of fromWarehouse) {
        await prisma.tradeShipment.update({
          where: { id: s.id },
          data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
        });
      }

      // Nobody confirms — force confirmationDeadline into past
      await prisma.trade.update({
        where: { id: tradeId },
        data: { confirmationDeadline: new Date(Date.now() - 1000) },
      });

      // Run auto-confirm scheduler
      const tradeScheduler = ctx.app.get(TradeSchedulerService);
      await tradeScheduler.handleExpiredTrades();

      // Trade should be completed
      const tradeAfter = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAfter?.status).toBe(TradeStatus.completed);

      // Cash payment should have holdReleaseAt set
      const cpAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
      expect(cpAfter?.holdReleaseAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();
    });
  });

  describe('Preparing deadline expiry', () => {
    it('auto-cancels order and refunds when preparing deadline passes', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 150,
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

      // Order should be preparing
      const orderBefore = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(['paid', 'preparing']).toContain(orderBefore?.status);

      // Force preparingDeadline into the past
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: {
          status: 'preparing',
          preparingDeadline: new Date(Date.now() - 1000),
          version: { increment: 1 },
        },
      });

      ctx.paytr.reset();
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.handleExpiredPreparingOrders();

      // Order should be cancelled
      const orderAfter = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(orderAfter?.status).toBe('cancelled');

      // PayTR refund was called
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);

      // Hold should be cancelled
      const holdAfter = await prisma.paymentHold.findFirst({ where: { orderId: buyRes.body.orderId } });
      expect(holdAfter?.status).toBe(PaymentHoldStatus.cancelled);
    });
  });
});
