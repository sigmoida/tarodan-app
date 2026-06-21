import * as request from 'supertest';
import {
  PaymentStatus,
  PaymentHoldStatus,
  PayoutStatus,
  PrismaClient,
  TradeStatus,
  ShipmentStatus,
  OrderStatus,
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

/**
 * Wait for the post-accept fire-and-forget inbound dispatch to settle.
 * Polling avoids racing with the in-flight TradeService background job
 * (which would otherwise duplicate to_warehouse rows).
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

      // Inbound shipments are auto-created on accept (post-tx, async).
      void initiatorShip;
      void receiverShip;
      const prisma = getPrisma();

      // Admin receives + approves
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
      // Y1: escrow yalnız sevk sonrası release olur — siparişi delivered yap.
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered },
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

      // Y1: escrow yalnız sevk sonrası release olur — siparişi delivered yap.
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered },
      });
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

      // Inbound shipments now auto-created post-cash-payment by PaymentService;
      // poll until both legs exist before admin acts on them.
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

  describe('Sürat Kargo cancellation on refund', () => {
    it('cancels Sürat shipment when order is refunded (sets shipment to cancelled)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      // Buy + pay (auto-creates Surat shipment in pending state)
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

      // Verify auto-created shipment exists
      const shipmentBefore = await prisma.shipment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(shipmentBefore?.provider).toBe('surat');
      expect(shipmentBefore?.status).toBe('pending');

      // Process refund — should cancel Surat shipment
      await ctx.app.get(PaymentService).processRefund(buyRes.body.orderId);

      // Shipment should be cancelled (best-effort but stub returns Tamam)
      const shipmentAfter = await prisma.shipment.findUnique({
        where: { id: shipmentBefore!.id },
      });
      expect(shipmentAfter?.status).toBe('cancelled');
    });

    it('cancels Sürat shipment when payment expires (auto-cancel)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

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

      // Manually create a shipment record (simulating auto-create that would happen on payment success)
      await prisma.shipment.create({
        data: {
          orderId: buyRes.body.orderId,
          provider: 'surat',
          status: 'pending',
          cost: 29.99,
        },
      });

      // Force payment older than timeout so it gets cancelled. Under the
      // split-window contract we ALSO must push the order's paymentExpiresAt
      // into the past — otherwise cancelExpiredPayments only fails the Payment
      // row and leaves the order (and its shipment) alive so the buyer can
      // re-initiate.
      const payment = await prisma.payment.findFirst({ where: { orderId: buyRes.body.orderId } });
      await prisma.payment.update({
        where: { id: payment!.id },
        data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) }, // 1 hour ago
      });
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { paymentExpiresAt: new Date(Date.now() - 60 * 1000) },
      });

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.cancelExpiredPayments();

      // Shipment should be cancelled
      const shipmentAfter = await prisma.shipment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(shipmentAfter?.status).toBe('cancelled');
    });
  });

  describe('Webhook authentication', () => {
    it('rejects webhook without secret header (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/shipping/webhook/surat')
        .send({ provider: 'surat', trackingNumber: 'TEST123', status: 'in_transit' })
        .expect(401);
    });

    it('rejects webhook with wrong secret (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/shipping/webhook/surat')
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({ provider: 'surat', trackingNumber: 'TEST123', status: 'in_transit' })
        .expect(401);
    });

    it('accepts webhook with correct secret', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/shipping/webhook/surat')
        .set('X-Webhook-Secret', 'test-webhook-secret')
        .send({ provider: 'surat', trackingNumber: 'NONEXIST', status: 'in_transit' });
      // 200 if shipment found, but with non-existent tracking we expect 404 or 200 with error
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('Sürat shipment cancel call assertions (using stub tracking)', () => {
    it('processRefund calls Sürat cancel with correct order number', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

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

      // Reset stub history before refund
      ctx.surat.reset();

      await ctx.app.get(PaymentService).processRefund(buyRes.body.orderId);

      // Surat cancel was called with the order number
      const order = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(ctx.surat.cancelCalls).toContain(order!.orderNumber);
    });
  });

  describe('Admin warehouse — Sürat shipment submission', () => {
    async function setupApprovedTrade() {
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
      // Inbound shipments are auto-created on accept; wait for the
      // fire-and-forget background dispatch.
      void initiatorShip;
      void receiverShip;
      const prisma = getPrisma();
      const incoming = await waitForInboundShipments(prisma, tradeId);
      for (const s of incoming) {
        await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/mark-warehouse-received`)
          .set(authHeader(admin))
          .send({ shipmentId: s.id })
          .expect(200);
      }
      return { tradeId, admin, initiator, receiver };
    }

    it('approveWarehouseTrade submits 2 from_warehouse shipments to Sürat', async () => {
      const { tradeId, admin } = await setupApprovedTrade();
      ctx.surat.reset();

      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/approve`)
        .set(authHeader(admin))
        .send({})
        .expect(200);

      // Two from_warehouse shipments submitted to Sürat
      expect(ctx.surat.shipmentCalls.length).toBe(2);
      const oids = ctx.surat.shipmentCalls.map((c) => c.OzelKargoTakipNo);
      expect(oids.some((o) => o.includes('INI'))).toBe(true);
      expect(oids.some((o) => o.includes('REC'))).toBe(true);

      // Both shipments marked as Sürat carrier
      const prisma = getPrisma();
      const shipments = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'from_warehouse' },
      });
      expect(shipments.length).toBe(2);
      expect(shipments.every((s) => s.carrier === 'surat')).toBe(true);
    });

    it('rejectWarehouseTrade submits 2 return shipments to Sürat with Iademi=true', async () => {
      const { tradeId, admin } = await setupApprovedTrade();
      ctx.surat.reset();

      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/reject`)
        .set(authHeader(admin))
        .send({ reason: 'Hasarlı' })
        .expect(200);

      // Two return shipments submitted to Sürat with Iademi=true
      expect(ctx.surat.shipmentCalls.length).toBe(2);
      expect(ctx.surat.shipmentCalls.every((c) => c.Iademi === true)).toBe(true);
    });
  });

  describe('Trade cancellation cancels Sürat shipments', () => {
    it('resolveDispute with cancel_trade cancels active Sürat shipments', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
      });
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
      const prisma = getPrisma();

      // Manually create an active Surat tradeShipment
      const adminAddrRow = await prisma.address.findFirst({ where: { userId: admin.id } });
      await prisma.tradeShipment.create({
        data: {
          tradeId,
          shipperId: admin.id,
          fromAddressId: adminAddrRow!.id,
          carrier: 'surat',
          trackingNumber: `TRD-${created.body.tradeNumber}-INI`,
          status: 'label_created' as any,
          shippedAt: new Date(),
          leg: 'from_warehouse',
          recipientType: 'user',
          recipientUserId: initiator.id,
        },
      });

      // Force trade to disputed
      await prisma.trade.update({
        where: { id: tradeId },
        data: { status: 'disputed' as any },
      });
      await prisma.tradeDispute.create({
        data: {
          tradeId,
          raisedById: initiator.id,
          reason: 'damaged',
          description: 'damaged product',
        },
      });

      ctx.surat.reset();

      const { TradeService } = require('../../src/modules/trade/trade.service');
      const tradeService = ctx.app.get(TradeService);
      await tradeService.resolveDispute(tradeId, admin.id, {
        resolution: 'cancel_trade',
        notes: 'admin decision',
      });

      // Sürat cancel should be called with the trade shipment's tracking number
      expect(ctx.surat.cancelCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sürat business failure rolls back admin approve', () => {
    it('admin approve fails when Sürat returns business error', async () => {
      // Set stub to return non-Tamam response (simulates Sürat rejecting payload)
      const oldEnv = process.env.SURAT_STUB_RESPONSE;
      process.env.SURAT_STUB_RESPONSE = 'Adres eksik';

      try {
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
        });
        const rp = await createProduct({
          sellerId: receiver.id,
          categoryId: baseline.categoryId,
          isTradeEnabled: true,
          quantity: 1,
        });
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
        // Inbound shipments auto-created on accept; the SURAT_STUB_RESPONSE
        // override applies to from_warehouse dispatch on admin approve, which
        // is the path under test below. Inbound legs may end up at `pending`
        // (Sürat returned non-Tamam) — admin still receives them manually.
        void initiatorShip;
        void receiverShip;
        const prisma = getPrisma();
        const incoming = await waitForInboundShipments(prisma, tradeId);
        for (const s of incoming) {
          await request(ctx.app.getHttpServer())
            .post(`/api/admin/trades/${tradeId}/mark-warehouse-received`)
            .set(authHeader(admin))
            .send({ shipmentId: s.id })
            .expect(200);
        }

        // Admin approve fails because Sürat returns business error
        const res = await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/approve`)
          .set(authHeader(admin))
          .send({});
        expect([400, 500]).toContain(res.status);

        // Trade should still be at_warehouse (not transitioned)
        const tradeAfter = await prisma.trade.findUnique({ where: { id: tradeId } });
        expect(tradeAfter?.status).toBe('at_warehouse');
      } finally {
        process.env.SURAT_STUB_RESPONSE = oldEnv;
      }
    });
  });

  describe('Tracking sync filters out shipments without tracking number', () => {
    it('syncAllActiveShipments skips Shipments with null providerTrackingId', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      // Create order
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      // Create a pending shipment WITHOUT tracking number
      await prisma.shipment.create({
        data: {
          orderId: buyRes.body.orderId,
          provider: 'surat',
          status: 'pending',
          cost: 29.99,
          // No trackingNumber, no providerTrackingId
        },
      });

      // Run sync — should NOT try to sync the no-tracking shipment
      const { SuratTrackingService } = require('../../src/modules/surat-cargo/surat-tracking.service');
      const tracking = ctx.app.get(SuratTrackingService);
      const result = await tracking.syncAllActiveShipments();

      // 0 syncs because the shipment has no tracking number
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
