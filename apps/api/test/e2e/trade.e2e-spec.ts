import * as request from 'supertest';
import {
  TradeStatus,
  PaymentStatus,
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
import { TradeSchedulerService } from '../../src/modules/trade/trade-scheduler.service';

/**
 * Helper: configure the warehouse address required by the admin approve flow.
 * resolveWarehouseAddressId() reads `warehouse_address_id` platform setting,
 * else falls back to first admin's address.
 */
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

describe('Trade Flow (Safe-Trade Warehouse Escrow) (E2E)', () => {
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

  describe('POST /api/trades — Create', () => {
    it('rejects self-trade with 400', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const productA = await createProduct({
        sellerId: user.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });
      await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(user))
        .send({
          receiverId: user.id,
          initiatorItems: [{ productId: productA.id, quantity: 1 }],
          receiverItems: [{ productId: productA.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('rejects when receiver\'s product is not trade-enabled', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const initiatorProduct = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
      });
      const receiverProduct = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: false, // not opted in
      });

      await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
          receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('creates a pending trade and does NOT reserve stock yet', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const initiatorProduct = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
      });
      const receiverProduct = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        quantity: 1,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
          receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.status).toBe('pending');

      const prisma = getPrisma();
      const ip = await prisma.product.findUnique({ where: { id: initiatorProduct.id } });
      const rp = await prisma.product.findUnique({ where: { id: receiverProduct.id } });
      expect(ip?.reservedQuantity).toBe(0);
      expect(rp?.reservedQuantity).toBe(0);
    });
  });

  describe('Scenario A — happy path with NO cash difference', () => {
    it('walks the trade pending → shipping_to_warehouse → at_warehouse → shipping_to_recipients → completed', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddress = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddress.id);

      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShipAddress = await createAddress({ userId: initiator.id, isDefault: false });
      const receiverShipAddress = await createAddress({ userId: receiver.id, isDefault: false });

      const initiatorProduct = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
      });
      const receiverProduct = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
      });

      // 1) Create trade
      const created = await request(ctx.app.getHttpServer())
        .post('/api/trades')
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: initiatorProduct.id, quantity: 1 }],
          receiverItems: [{ productId: receiverProduct.id, quantity: 1 }],
        })
        .expect(201);
      const tradeId: string = created.body.id;

      // 2) Receiver accepts → no cash, goes straight to shipping_to_warehouse
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      const tradeAfterAccept = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAfterAccept?.status).toBe(TradeStatus.shipping_to_warehouse);
      expect(tradeAfterAccept?.acceptedAt).toBeTruthy();
      expect(tradeAfterAccept?.shippingDeadline).toBeTruthy();

      // Stock reservations should now exist on both products
      const ip = await prisma.product.findUnique({ where: { id: initiatorProduct.id } });
      const rp = await prisma.product.findUnique({ where: { id: receiverProduct.id } });
      expect(ip?.reservedQuantity).toBe(1);
      expect(rp?.reservedQuantity).toBe(1);

      // 3) Both parties ship to warehouse
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(initiator))
        .send({
          fromAddressId: initiatorShipAddress.id,
          carrier: 'Sürat Kargo',
        })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/ship-to-warehouse`)
        .set(authHeader(receiver))
        .send({
          fromAddressId: receiverShipAddress.id,
          carrier: 'Sürat Kargo',
        })
        .expect(201);

      const toWarehouse = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
      });
      expect(toWarehouse).toHaveLength(2);

      // 4) Admin marks both shipments as delivered to warehouse
      for (const shipment of toWarehouse) {
        await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/mark-warehouse-received`)
          .set(authHeader(admin))
          .send({ shipmentId: shipment.id })
          .expect(200);
      }
      const tradeAtWarehouse = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAtWarehouse?.status).toBe(TradeStatus.at_warehouse);

      // 5) Admin approves → from_warehouse shipments + shipping_to_recipients
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/approve`)
        .set(authHeader(admin))
        .send({ notes: 'looks good' })
        .expect(200);
      const tradeShipping = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeShipping?.status).toBe(TradeStatus.shipping_to_recipients);

      const fromWarehouse = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'from_warehouse' },
      });
      expect(fromWarehouse).toHaveLength(2);
      const recipientIds = new Set(fromWarehouse.map((s) => s.recipientUserId));
      expect(recipientIds.has(initiator.id)).toBe(true);
      expect(recipientIds.has(receiver.id)).toBe(true);

      // 6) Each recipient confirms receipt of their from_warehouse shipment.
      //    Service expects the shipment to actually be delivered first; we
      //    flip its status here to mirror what the carrier-poll cron would do.
      for (const shipment of fromWarehouse) {
        await prisma.tradeShipment.update({
          where: { id: shipment.id },
          data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
        });
      }

      // initiator confirms first
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/confirm-receipt`)
        .set(authHeader(initiator))
        .send({})
        .expect(201);
      // receiver confirms — both confirmed → completed
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/confirm-receipt`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const finalTrade = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(finalTrade?.status).toBe(TradeStatus.completed);

      // Stock decrement & reservation release on both products
      const finalIP = await prisma.product.findUnique({ where: { id: initiatorProduct.id } });
      const finalRP = await prisma.product.findUnique({ where: { id: receiverProduct.id } });
      expect(finalIP?.quantity).toBe(0);
      expect(finalIP?.reservedQuantity).toBe(0);
      expect(finalRP?.quantity).toBe(0);
      expect(finalRP?.reservedQuantity).toBe(0);
    });
  });

  describe('Scenario B — cash difference (initiator pays extra)', () => {
    it('routes through awaiting_payment, escrows cash on PayTR success, and only ships after payment', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddress = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddress.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 100,
        quantity: 1,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
      });

      // 1) Create trade with cashAmount=100 (initiator pays receiver)
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

      // 2) Accept → awaiting_payment + TradeCashPayment row in pending
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
      const tradeAwaiting = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAwaiting?.status).toBe(TradeStatus.awaiting_payment);

      const cashPaymentBefore = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      expect(cashPaymentBefore).toBeTruthy();
      expect(cashPaymentBefore?.payerId).toBe(initiator.id);
      expect(cashPaymentBefore?.recipientId).toBe(receiver.id);
      expect(cashPaymentBefore?.status).toBe(PaymentStatus.pending);
      expect(cashPaymentBefore?.releasedAt).toBeNull();
      expect(cashPaymentBefore?.holdReleaseAt).toBeNull();

      // 3) Initiate trade-cash payment
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate-trade-cash')
        .set(authHeader(initiator))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cashPaymentBefore!.id },
      });
      expect(payment?.status).toBe(PaymentStatus.pending);
      expect(payment?.providerConversationId).toBeTruthy();

      // 4) PayTR callback success → trade flips to shipping_to_warehouse, cash escrowed
      const totalKurus = Math.round(Number(payment!.amount) * 100);
      const cb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: totalKurus,
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(cb)
        .expect(200);

      const tradeAfterPay = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeAfterPay?.status).toBe(TradeStatus.shipping_to_warehouse);
      const cashPaymentAfterPay = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      expect(cashPaymentAfterPay?.status).toBe(PaymentStatus.completed);
      // Money is escrowed: not released to recipient yet
      expect(cashPaymentAfterPay?.releasedAt).toBeNull();
      expect(cashPaymentAfterPay?.holdReleaseAt).toBeNull();
    });

    it('blocks ship-to-warehouse while trade is still awaiting_payment', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const initiatorShipAddress = await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });

      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 100,
        quantity: 1,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
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

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${created.body.id}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      // Cash not yet paid — ship-to-warehouse must fail
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${created.body.id}/ship-to-warehouse`)
        .set(authHeader(initiator))
        .send({ fromAddressId: initiatorShipAddress.id, carrier: 'Sürat Kargo' })
        .expect(400);
    });
  });

  describe('Scenario C — admin rejects items at warehouse', () => {
    it('creates return shipments, transitions to returning, marks return delivered → cancelled', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const admin = await createAdminUser(ctx.module);
      const adminAddress = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddress.id);
      const initiatorShip = await createAddress({ userId: initiator.id });
      const receiverShip = await createAddress({ userId: receiver.id });

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

      // Admin rejects → returning + 2 return shipments
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${tradeId}/reject`)
        .set(authHeader(admin))
        .send({ reason: 'Eşya hasarlı geldi' })
        .expect(200);
      const tradeReturning = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeReturning?.status).toBe(TradeStatus.returning);

      const returns = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'return' },
      });
      expect(returns).toHaveLength(2);

      // Mark each return as delivered → cancelled
      for (const ret of returns) {
        await request(ctx.app.getHttpServer())
          .post(`/api/admin/trades/${tradeId}/mark-return-delivered`)
          .set(authHeader(admin))
          .send({ shipmentId: ret.id })
          .expect(200);
      }
      const tradeFinal = await prisma.trade.findUnique({ where: { id: tradeId } });
      expect(tradeFinal?.status).toBe(TradeStatus.cancelled);

      // Stock reservations released (no sale happened)
      const finalIP = await prisma.product.findUnique({ where: { id: ip.id } });
      const finalRP = await prisma.product.findUnique({ where: { id: rp.id } });
      expect(finalIP?.reservedQuantity).toBe(0);
      expect(finalRP?.reservedQuantity).toBe(0);
      expect(finalIP?.quantity).toBe(1);
      expect(finalRP?.quantity).toBe(1);
    });
  });

  describe('Scenario D — responseDeadline expiry via scheduler', () => {
    it('autoCancelExpiredTrades flips a stale pending trade to cancelled', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
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
        })
        .expect(201);

      // Force responseDeadline into the past, then run the cron
      const prisma = getPrisma();
      await prisma.trade.update({
        where: { id: created.body.id },
        data: { responseDeadline: new Date(Date.now() - 60_000) },
      });

      const scheduler = ctx.app.get(TradeSchedulerService);
      await scheduler.handleExpiredTrades();

      const after = await prisma.trade.findUnique({ where: { id: created.body.id } });
      expect(after?.status).toBe(TradeStatus.cancelled);
    });
  });

  describe('Scenario E — auth/role gates', () => {
    it('forbids non-receiver from accepting', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module);
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
        })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${created.body.id}/accept`)
        .set(authHeader(intruder))
        .send({})
        .expect(403);
    });

    it('forbids non-admin from approving the warehouse trade', async () => {
      const initiator = await createUser(ctx.module, { isSeller: true });
      const receiver = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module);
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
        })
        .expect(201);

      // Intruder lacks AdminUser → admin guard rejects
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/trades/${created.body.id}/approve`)
        .set(authHeader(intruder))
        .send({})
        .expect(401);
    });
  });
});
