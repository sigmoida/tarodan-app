import * as request from "supertest";
import { PaymentStatus, PayoutStatus, TradeStatus } from "@prisma/client";
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
 * Admin payout management endpoint tests.
 */
describe("Admin Payout Management (E2E)", () => {
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

  describe("POST /api/admin/payouts/release-trade/:tradeId", () => {
    it("releases trade cash hold early when admin requests", async () => {
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

      // Create trade with cash
      const created = await request(ctx.app.getHttpServer())
        .post("/api/trades")
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: ip.id, quantity: 1 }],
          receiverItems: [{ productId: rp.id, quantity: 1 }],
          cashAmount: 75,
        })
        .expect(201);
      const tradeId = created.body.id;

      // Accept + pay
      await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);

      const prisma = getPrisma();
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

      // TradeCashPayment should be completed but not released
      const cpBefore = await prisma.tradeCashPayment.findFirst({
        where: { tradeId },
      });
      expect(cpBefore?.status).toBe(PaymentStatus.completed);
      expect(cpBefore?.releasedAt).toBeNull();

      // Admin releases early
      const releaseRes = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/release-trade/${tradeId}`)
        .set(authHeader(admin))
        .expect(200);

      expect(releaseRes.body.success).toBe(true);

      // Verify released
      const cpAfter = await prisma.tradeCashPayment.findFirst({
        where: { tradeId },
      });
      expect(cpAfter?.releasedAt).toBeTruthy();
    });

    it("rejects non-admin users", async () => {
      const user = await createUser(ctx.module);
      await request(ctx.app.getHttpServer())
        .post("/api/admin/payouts/release-trade/fake-id")
        .set(authHeader(user))
        .expect(401);
    });
  });

  describe("POST /api/admin/payouts/:transferId/retry", () => {
    it("retries a failed payout transfer", async () => {
      const prisma = getPrisma();
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });

      // Create a failed payout transfer directly
      const payout = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 5,
          netAmount: 95,
          merchantOid: "TEST123",
          transId: `RETRY${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.failed,
          failureReason: "IBAN error",
          retryCount: 3,
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/${payout.id}/retry`)
        .set(authHeader(admin))
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify it's back to pending
      const payoutAfter = await prisma.payoutTransfer.findUnique({
        where: { id: payout.id },
      });
      expect(payoutAfter?.status).toBe(PayoutStatus.pending);
      expect(payoutAfter?.retryCount).toBe(0);
      expect(payoutAfter?.failureReason).toBeNull();
    });
  });

  describe("GET /api/admin/payouts/failed", () => {
    it("lists failed and returned payout transfers", async () => {
      const prisma = getPrisma();
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });

      // Create some payouts with different statuses
      await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 5,
          netAmount: 95,
          merchantOid: "F1",
          transId: `F1${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.failed,
          failureReason: "no_bank_account",
        },
      });
      await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 200,
          commission: 10,
          netAmount: 190,
          merchantOid: "F2",
          transId: `F2${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.returned,
          failureReason: "Geri döndü",
        },
      });
      await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 300,
          commission: 15,
          netAmount: 285,
          merchantOid: "C1",
          transId: `C1${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.completed,
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .get("/api/admin/payouts/failed")
        .set(authHeader(admin))
        .expect(200);

      // Should only list failed + returned, not completed
      expect(res.body.total).toBe(2);
      expect(res.body.items.length).toBe(2);
      const statuses = res.body.items.map((i: any) => i.status);
      expect(statuses).toContain("failed");
      expect(statuses).toContain("returned");
      expect(statuses).not.toContain("completed");
    });
  });
});
