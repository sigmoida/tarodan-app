import * as request from "supertest";
import {
  PaymentStatus,
  PaymentHoldStatus,
  PayoutStatus,
  PrismaClient,
  TradeStatus,
  ShipmentStatus,
  OrderStatus,
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
import { signCallback } from "../mocks/paytr.mock";
import { buyAndPay } from "../factories/flows";
import { PaymentService } from "../../src/modules/payment/payment.service";
import { PayoutService } from "../../src/modules/payout/payout.service";

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
 * Payout tests verify that released holds produce PayoutTransfer records
 * and that the PayTR Platform Transfer API is called correctly.
 */
describe("Payout Flow (E2E)", () => {
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

  describe("Order hold → release → PayoutTransfer", () => {
    it("creates a PayoutTransfer with correct amounts after hold release when seller has IBAN", async () => {
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

      const prisma = getPrisma();

      // Seller adds bank account
      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: "Mehmet Yılmaz",
          iban: "TR330006100519786457841326",
        },
      });

      // Buy + pay
      const buyRes = await request(ctx.app.getHttpServer())
        .post("/api/orders/buy")
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: "paytr" })
        .expect(201);

      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      // Hold exists
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(hold).toBeTruthy();
      expect(hold?.status).toBe(PaymentHoldStatus.held);

      // Y1: escrow yalnız sevk sonrası release olur — siparişi delivered yap.
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered },
      });
      // Force release
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.releaseHoldsDue();

      // Now create payouts for released holds
      const payoutService = ctx.app.get(PayoutService);
      const created = await payoutService.createPayoutsForReleasedHolds();
      expect(created).toBeGreaterThanOrEqual(1);

      // Verify PayoutTransfer
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.status).toBe(PayoutStatus.pending);
      expect(payout?.sellerId).toBe(seller.id);
      expect(payout?.transferIban).toBe("TR330006100519786457841326");
      expect(payout?.transferName).toBe("Mehmet Yılmaz");
      expect(Number(payout?.netAmount)).toBeGreaterThan(0);

      // Process the payout — calls mock PayTR
      const result = await payoutService.processPendingPayouts();
      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);

      // Verify PayTR was called
      expect(ctx.paytr.transferCalls.length).toBeGreaterThanOrEqual(1);
      expect(ctx.paytr.transferCalls[0].transferIban).toBe(
        "TR330006100519786457841326",
      );

      // Verify PayoutTransfer is now completed
      const payoutAfter = await prisma.payoutTransfer.findUnique({
        where: { id: payout!.id },
      });
      expect(payoutAfter?.status).toBe(PayoutStatus.completed);
      expect(payoutAfter?.processedAt).toBeTruthy();
    });

    it("creates a failed PayoutTransfer when seller has no IBAN", async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      // Seller does NOT add bank account
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const prisma = getPrisma();

      // Buy + pay + callback
      const buyRes = await request(ctx.app.getHttpServer())
        .post("/api/orders/buy")
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: "paytr" })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      // Y1: escrow yalnız sevk sonrası release olur — siparişi delivered yap.
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered },
      });
      // Force release
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();

      // Create payouts
      const payoutService = ctx.app.get(PayoutService);
      await payoutService.createPayoutsForReleasedHolds();

      // PayoutTransfer should be failed with no_bank_account
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.status).toBe(PayoutStatus.failed);
      expect(payout?.failureReason).toBe("no_bank_account");
      expect(payout?.transferIban).toBe("");
    });
  });

  describe("PayTR transfer failure → retry", () => {
    it("retries a failed transfer up to 3 times with exponential backoff, then permanently fails", async () => {
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

      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: "Test Seller",
          iban: "TR330006100519786457841326",
        },
      });

      // Buy + pay
      const buyRes = await request(ctx.app.getHttpServer())
        .post("/api/orders/buy")
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: "paytr" })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      // Y1: escrow yalnız sevk sonrası release olur — siparişi delivered yap.
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered },
      });
      // Release + create payout
      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();

      const payoutService = ctx.app.get(PayoutService);
      await payoutService.createPayoutsForReleasedHolds();

      // Make PayTR fail
      ctx.paytr.nextTransferFails = true;

      // Attempt 1: fails → retry_pending
      let result = await payoutService.processPendingPayouts();
      expect(result.failed).toBeGreaterThanOrEqual(1);

      let payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout?.status).toBe(PayoutStatus.retry_pending);
      expect(payout?.retryCount).toBe(1);
      expect(payout?.nextRetryAt).toBeTruthy();

      // Simulate time passing, move to pending for retry
      await prisma.payoutTransfer.update({
        where: { id: payout!.id },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });
      await payoutService.processRetryPayouts();

      // Attempt 2: fails again
      ctx.paytr.nextTransferFails = true;
      result = await payoutService.processPendingPayouts();
      payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout?.retryCount).toBe(2);

      // Move to pending for retry again
      await prisma.payoutTransfer.update({
        where: { id: payout!.id },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });
      await payoutService.processRetryPayouts();

      // Attempt 3: permanent failure
      ctx.paytr.nextTransferFails = true;
      result = await payoutService.processPendingPayouts();
      payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout?.status).toBe(PayoutStatus.failed);
      expect(payout?.retryCount).toBe(3);
    });
  });

  describe("Trade cash payout", () => {
    it("creates PayoutTransfer for trade cash recipient after hold release", async () => {
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

      const prisma = getPrisma();

      // Receiver (cash recipient) adds bank account
      await prisma.sellerBankAccount.create({
        data: {
          userId: receiver.id,
          accountHolder: "Receiver Bank",
          iban: "TR780001000999988887777666",
        },
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

      // Create trade with cash difference
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

      // Accept + pay
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const cp = await prisma.tradeCashPayment.findFirst({
        where: { tradeId },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/payments/initiate-trade-cash")
        .set(authHeader(initiator))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cp!.id },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);

      // Walk trade to completion. Inbound shipments auto-created
      // post-cash-payment; poll for the fire-and-forget dispatch.
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

      // Trade completed, holdReleaseAt set
      const cpAfter = await prisma.tradeCashPayment.findFirst({
        where: { tradeId },
      });
      expect(cpAfter?.holdReleaseAt).toBeTruthy();

      // Force release + create payouts
      await prisma.tradeCashPayment.update({
        where: { id: cpAfter!.id },
        data: { holdReleaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();

      const payoutService = ctx.app.get(PayoutService);
      const created2 = await payoutService.createPayoutsForReleasedHolds();
      expect(created2).toBeGreaterThanOrEqual(1);

      // Verify PayoutTransfer points to receiver (cash recipient)
      const payout = await prisma.payoutTransfer.findFirst({
        where: { tradeCashPaymentId: cpAfter!.id },
      });
      expect(payout).toBeTruthy();
      expect(payout?.sellerId).toBe(receiver.id);
      expect(payout?.transferIban).toBe("TR780001000999988887777666");
      expect(payout?.status).toBe(PayoutStatus.pending);

      // Process payout
      const processResult = await payoutService.processPendingPayouts();
      expect(processResult.processed).toBeGreaterThanOrEqual(1);

      const payoutFinal = await prisma.payoutTransfer.findUnique({
        where: { id: payout!.id },
      });
      expect(payoutFinal?.status).toBe(PayoutStatus.completed);
      expect(ctx.paytr.transferCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * İade/iptalle kapanmış siparişte satıcıya BIRAKILAN kargo payı (hold
   * kalıntısı): kusur satıcıda değilse cron bırakır, payout kalıntıyı öder ve
   * defter tam o tutarla kapanır; kusur satıcıdaysa para tutulur.
   */
  describe("Residual hold on a closed order", () => {
    const RETAINED = 25;

    /** Ödenmiş siparişi "iade/iptal sonrası" durumuna çeker: kalıntı = 25. */
    async function closedOrderWithResidual(fault: "buyer" | "seller") {
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
      const prisma = getPrisma();
      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: "Mehmet Yılmaz",
          iban: "TR330006100519786457841326",
        },
      });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      const hold = await prisma.paymentHold.findFirstOrThrow({
        where: { orderId },
      });
      // PayTR ödeme günü transfer kabul etmez — ödemeyi dünden say.
      await prisma.payment.update({
        where: { id: hold.paymentId },
        data: { paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });
      // Kargoya verilmeden iptal: hold damgasız, iade kalıntı dışını tüketti.
      await prisma.paymentHold.update({
        where: { id: hold.id },
        data: {
          refundedAmount: Number(hold.amount) - RETAINED,
          releaseAt: null,
          frozenByRefundId: null,
        },
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.cancelled },
      });
      await prisma.refundRequest.create({
        data: {
          refundNumber: `RF-RESIDUAL-${fault}-${orderId.slice(0, 8)}`,
          orderId,
          requesterId: buyer.id,
          reason: fault === "seller" ? "delivery_delayed" : "changed_mind",
          amount: Number(hold.amount) - RETAINED,
          status: "refunded",
          faultParty: fault,
          policyVersion: 2,
          policyCode: `v2_${fault}_cancellation`,
          sellerShippingCompensationAmount: RETAINED,
          refundedAt: new Date(),
        },
      });
      return { orderId, holdId: hold.id };
    }

    it("buyer fault: the cron releases the residual, the payout pays exactly it, and a re-run is a no-op", async () => {
      const prisma = getPrisma();
      const { holdId, orderId } = await closedOrderWithResidual("buyer");
      const paymentService = ctx.app.get(PaymentService);
      const payoutService = ctx.app.get(PayoutService);

      await paymentService.releaseHoldsDue();
      const released = await prisma.paymentHold.findUniqueOrThrow({
        where: { id: holdId },
      });
      expect(released.status).toBe(PaymentHoldStatus.released);

      expect(await payoutService.createPayoutsForReleasedHolds()).toBe(1);
      const payout = await prisma.payoutTransfer.findFirstOrThrow({
        where: { paymentHoldId: holdId },
      });
      expect(Number(payout.netAmount)).toBe(RETAINED);

      // Idempotent: a second sweep neither re-releases nor creates a payout.
      await paymentService.releaseHoldsDue();
      expect(await payoutService.createPayoutsForReleasedHolds()).toBe(0);
      expect(
        await prisma.payoutTransfer.count({ where: { paymentHoldId: holdId } }),
      ).toBe(1);

      // Transfer → the ledger settles exactly the residual from seller escrow.
      await payoutService.processPendingPayouts();
      const settled = await prisma.payoutTransfer.findUniqueOrThrow({
        where: { id: payout.id },
      });
      expect(settled.status).toBe(PayoutStatus.completed);
      const ledger = await prisma.ledgerEntry.findMany({
        where: { idempotencyKey: `payout-completed:${payout.id}` },
      });
      expect(
        ledger.map((row) => [row.account, row.direction, Number(row.amount)]),
      ).toEqual(
        expect.arrayContaining([
          ["seller_escrow", "credit", RETAINED],
          ["payout", "debit", RETAINED],
        ]),
      );
      expect(ledger.every((row) => row.orderId === orderId)).toBe(true);
    });

    it("seller fault: the residual stays held and the manual release says why", async () => {
      const prisma = getPrisma();
      const { holdId, orderId } = await closedOrderWithResidual("seller");

      await ctx.app.get(PaymentService).releaseHoldsDue();
      const kept = await prisma.paymentHold.findUniqueOrThrow({
        where: { id: holdId },
      });
      expect(kept.status).toBe(PaymentHoldStatus.held);

      const admin = await createAdminUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/release/${orderId}`)
        .set(authHeader(admin))
        .send({ reason: "Kalan kargo payı" })
        .expect(400);
      expect(res.body.i18nKey).toBe(
        "server.payment.holdReleaseBlocked.sellerAtFault",
      );
      expect(
        await prisma.payoutTransfer.count({ where: { paymentHoldId: holdId } }),
      ).toBe(0);
    });
  });
});
