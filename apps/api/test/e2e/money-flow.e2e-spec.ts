import * as request from "supertest";
import {
  CancellationActor,
  PaymentStatus,
  PaymentHoldStatus,
  PrismaClient,
  TradeStatus,
  ShipmentStatus,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";
import { buyAndPay, payTradeBothSides, payTradeSide } from "../factories/flows";
import { PaymentService } from "../../src/modules/payment/payment.service";
import { PayoutService } from "../../src/modules/payout/payout.service";
import { TradeService } from "../../src/modules/trade/trade.service";

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
    where: { tradeId, leg: "to_warehouse" },
  });
  while (rows.length < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: "to_warehouse" },
    });
  }
  return rows;
}

async function configureWarehouseAddress(addressId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.platformSetting.upsert({
    where: { settingKey: "warehouse_address_id" },
    update: { settingValue: addressId },
    create: {
      settingKey: "warehouse_address_id",
      settingValue: addressId,
      settingType: "string",
    },
  });
}

/**
 * Money-flow tests answer the question: "where is the money RIGHT NOW?"
 * They walk an order/trade across each lifecycle boundary and assert the
 * Payment / PaymentHold / TradeCashPayment rows match the expected state.
 */

describe("Money Flow Timeline (E2E)", () => {
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

  describe("Order: pay → hold → confirm → release after window", () => {
    it("PaymentHold is held during fulfillment, released only after the cron fires past releaseAt", async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      // Buy + initiate + callback (current order-create contract, signed
      // success callback, fulfillment settled) via the shared flow.
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
      const buyRes = { body: { orderId } };
      const prisma = getPrisma();

      // T0: hold exists, status held, releaseAt set in the future
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(hold).toBeTruthy();
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releasedAt).toBeNull();
      // releaseAt ödeme anında SET EDİLMEZ; teslimde (deliveredAt + return + grace)
      // hesaplanır. T0'da null olması beklenir (bkz. payment.service createPaymentHold).
      expect(hold?.releaseAt).toBeNull();

      // T+release: confirm delivery (manual delivered transition for test brevity)
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: "delivered", version: { increment: 1 } },
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
      const payoutsCreated =
        await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);

      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.sellerId).toBe(seller.id);
      expect(Number(payout?.netAmount)).toBeGreaterThan(0);
    });
  });

  describe("Trade cash: escrowed during fulfilment, recipient paid only after both confirm + window", () => {
    it("completes a cash trade and only releases TradeCashPayment after holdReleaseAt passes", async () => {
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);

      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShip = await createAddress({
        userId: initiator.id,
        isDefault: false,
      });
      const receiverShip = await createAddress({
        userId: receiver.id,
        isDefault: false,
      });

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
        .post("/api/trades")
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
      // v2 (5ee405ea6): one payment row per party. The initiator's row
      // carries the cash difference owed to the receiver.
      const initiatorRow = { tradeId, payerId: initiator.id };
      let cashPayment = await prisma.tradeCashPayment.findFirst({
        where: initiatorRow,
      });
      expect(cashPayment?.status).toBe(PaymentStatus.pending);
      expect(cashPayment?.recipientId).toBe(receiver.id);
      expect(cashPayment?.holdReleaseAt).toBeNull();

      // Both parties pay; the trade leaves for the warehouse only then.
      await payTradeBothSides(ctx, tradeId, [initiator, receiver]);

      // Cash escrowed: completed but not released
      cashPayment = await prisma.tradeCashPayment.findFirst({
        where: initiatorRow,
      });
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
        where: { tradeId, leg: "from_warehouse" },
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

      const tradeAfter = await prisma.trade.findUnique({
        where: { id: tradeId },
      });
      expect(tradeAfter?.status).toBe(TradeStatus.completed);

      // After completion: holdReleaseAt set in the future, releasedAt still null
      cashPayment = await prisma.tradeCashPayment.findFirst({
        where: initiatorRow,
      });
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

      cashPayment = await prisma.tradeCashPayment.findFirst({
        where: initiatorRow,
      });
      expect(cashPayment?.releasedAt).toBeTruthy();

      // Verify: PayoutTransfer can be created for the released trade cash
      const payoutService = ctx.app.get(PayoutService);
      const payoutsCreated =
        await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);

      const payout = await prisma.payoutTransfer.findFirst({
        where: { tradeCashPaymentId: cashPayment!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.sellerId).toBe(receiver.id);
    });
  });

  describe("Trade cash refund on cancellation", () => {
    it("refundTradeCashPaymentIfCompleted issues a PayTR refund and stamps refundedAt", async () => {
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
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
        .post("/api/trades")
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

      // Only the initiator pays (their row carries the cash difference); the
      // v2 trade stays awaiting_payment until the receiver pays too.
      const { tradeCashPaymentId } = await payTradeSide(
        ctx,
        created.body.id,
        initiator,
      );
      const cp = { id: tradeCashPaymentId };

      const paymentService = ctx.app.get(PaymentService);
      const result = await paymentService.refundTradeCashPaymentIfCompleted(
        created.body.id,
      );
      expect(result.refunded).toBe(true);

      const cpAfter = await prisma.tradeCashPayment.findUnique({
        where: { id: cp!.id },
      });
      expect(cpAfter?.refundedAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();

      // Mock PayTR recorded the refund call
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("G3: süre aşımı auto-cancel ödenmiş nakit takası iptal eder VE nakit iadesini tetikler", async () => {
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
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
        .post("/api/trades")
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
      // v2 (5ee405ea6): the trade leaves for the warehouse only after BOTH
      // parties have paid; paying the initiator alone left it awaiting_payment.
      const { tradeCashPaymentId } = await payTradeSide(
        ctx,
        created.body.id,
        initiator,
      );
      const cp = { id: tradeCashPaymentId };
      const { tradeCashPaymentId: receiverRowId } = await payTradeSide(
        ctx,
        created.body.id,
        receiver,
      );

      // Ödeme sonrası takas shipping_to_warehouse'a geçer; henüz depoya ulaşmadı.
      const paid = await prisma.trade.findUnique({
        where: { id: created.body.id },
      });
      expect(paid!.status).toBe(TradeStatus.shipping_to_warehouse);

      // Süreyi geçmişe çek, depoya varış yok → auto-cancel uygun
      await prisma.trade.update({
        where: { id: created.body.id },
        data: {
          shippingDeadline: new Date(Date.now() - 60 * 60 * 1000),
          firstWarehouseArrivalAt: null,
        },
      });

      const tradeService = ctx.app.get(TradeService);
      await tradeService.autoCancelExpiredTrades();

      const cancelled = await prisma.trade.findUnique({
        where: { id: created.body.id },
      });
      expect(cancelled!.status).toBe(TradeStatus.cancelled);

      const cpAfter = await prisma.tradeCashPayment.findUnique({
        where: { id: cp!.id },
      });
      expect(cpAfter!.refundedAt).toBeTruthy();
      // Neither party reached the warehouse: both payments go back.
      const receiverRowAfter = await prisma.tradeCashPayment.findUnique({
        where: { id: receiverRowId },
      });
      expect(receiverRowAfter!.refundedAt).toBeTruthy();
      // One PayTR refund per paid row, never a second one for the same row.
      expect(ctx.paytr.refundCalls).toHaveLength(2);
      expect(
        new Set(ctx.paytr.refundCalls.map((c) => c.merchantOid)).size,
      ).toBe(2);
    });
  });

  describe("Order refund restores product stock", () => {
    it("processRefund cancels order, cancels hold, and re-stocks the product", async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const prisma = getPrisma();

      // Buy + pay via the shared flow.
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
      const buyRes = { body: { orderId } };

      // Verify product stock decremented
      const productAfterPay = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfterPay?.quantity).toBe(0);

      // Refund
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.processRefund(buyRes.body.orderId, undefined, {
        cancelledBy: CancellationActor.platform,
      });

      // Order should be cancelled
      const orderAfter = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      expect(orderAfter?.status).toBe("cancelled");

      // Hold should be cancelled
      const holdAfter = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(holdAfter?.status).toBe(PaymentHoldStatus.cancelled);

      // PayTR refund was called
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Trade cash refund after admin warehouse rejection", () => {
    it("admin reject triggers PayTR refund for completed cash payment", async () => {
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const admin = await createAdminUser(ctx.module);
      const adminAddr = await createAddress({ userId: admin.id });
      await configureWarehouseAddress(adminAddr.id);
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });
      const initiatorShip = await createAddress({
        userId: initiator.id,
        isDefault: false,
      });
      const receiverShip = await createAddress({
        userId: receiver.id,
        isDefault: false,
      });

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
        .post("/api/trades")
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
      // v2 (5ee405ea6): both parties pay before the goods leave; the
      // initiator's row carries the cash difference.
      await payTradeBothSides(ctx, tradeId, [initiator, receiver]);

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
        // faultySide is required since 0ab45dde7 (warehouse inspection step):
        // the receiver's item failed, so the initiator is faultless.
        .send({ reason: "Ürün hasarlı", faultySide: "receiver" })
        .expect(200);

      // The faultless initiator gets everything back, once. The faulty
      // receiver loses the service fee and, the parcels having shipped, the
      // shipping (trade-refund-policy); its row carries only those two, so
      // nothing is left to refund and PayTR is not called for it.
      const cpAfter = await prisma.tradeCashPayment.findFirst({
        where: { tradeId, payerId: initiator.id },
      });
      expect(cpAfter?.refundedAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();
      expect(cpAfter?.fullRefundEntitled).toBe(true);
      const receiverRow = await prisma.tradeCashPayment.findFirst({
        where: { tradeId, payerId: receiver.id },
      });
      expect(receiverRow?.fullRefundEntitled).toBe(false);
      expect(
        Number(receiverRow!.totalAmount) -
          Number(receiverRow!.tradeFeeAmount) -
          Number(receiverRow!.shippingAmount),
      ).toBeCloseTo(0, 2);
      expect(receiverRow?.refundedAt).toBeNull();
      expect(receiverRow?.releasedAt).toBeNull();

      const initiatorPayment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cpAfter!.id },
        orderBy: { createdAt: "desc" },
      });
      expect(ctx.paytr.refundCalls).toHaveLength(1);
      expect(ctx.paytr.refundCalls[0].merchantOid).toBe(
        initiatorPayment!.providerConversationId,
      );
      expect(ctx.paytr.refundCalls[0].refundAmount).toBeCloseTo(
        Number(cpAfter!.totalAmount),
        2,
      );

      // Trade should be returning or cancelled
      const tradeAfter = await prisma.trade.findUnique({
        where: { id: tradeId },
      });
      expect(["returning", "cancelled"]).toContain(tradeAfter?.status);
    });
  });

  describe("Trade cash refund blocks future PayoutTransfer", () => {
    it("no PayoutTransfer is created after refund", async () => {
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
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
        .post("/api/trades")
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
      // Only the initiator pays (their row carries the cash difference); the
      // v2 trade stays awaiting_payment until the receiver pays too.
      const { tradeCashPaymentId } = await payTradeSide(
        ctx,
        created.body.id,
        initiator,
      );
      const cp = { id: tradeCashPaymentId };

      // Refund the cash payment
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.refundTradeCashPaymentIfCompleted(created.body.id);

      // Try to create payouts — should create 0 (refunded, not released)
      const payoutService = ctx.app.get(PayoutService);
      const payoutsCreated =
        await payoutService.createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBe(0);

      // No PayoutTransfer should exist for this trade
      const payouts = await prisma.payoutTransfer.findMany({
        where: { tradeCashPaymentId: cp!.id },
      });
      expect(payouts.length).toBe(0);
    });
  });
});
