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
          // PayTR refused it: no panel check needed before a retry.
          failureReason: "provider_rejected",
          providerResponse: { status: "error", err_no: "001" },
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
      expect(payoutAfter?.transId).toBe(payout.transId);
    });

    it("needs the PayTR panel check before retrying an unknown outcome", async () => {
      const prisma = getPrisma();
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const payout = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 5,
          netAmount: 95,
          merchantOid: "UNKNOWN1",
          transId: `UNKNOWN${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.failed,
          failureReason: "transfer_outcome_unknown",
          submittedAmount: 95,
          submittedTotalAmount: 100,
        },
      });

      const refused = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/${payout.id}/retry`)
        .set(authHeader(admin))
        .expect(409);
      expect(refused.body.i18nKey).toBe(
        "server.admin.payout.providerCheckRequired",
      );
      expect(
        (await prisma.payoutTransfer.findUnique({ where: { id: payout.id } }))
          ?.status,
      ).toBe(PayoutStatus.failed);

      await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/${payout.id}/retry`)
        .set(authHeader(admin))
        .send({
          confirmProviderChecked: true,
          reason: "PayTR panel: no transfer with this trans_id",
        })
        .expect(200);

      const after = await prisma.payoutTransfer.findUnique({
        where: { id: payout.id },
      });
      expect(after).toMatchObject({
        status: PayoutStatus.pending,
        transId: payout.transId,
      });
      // Kept for a late PayTR callback of the earlier send; not counted while
      // pending and overwritten by the next claim.
      expect(Number(after?.submittedTotalAmount)).toBe(100);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "payout_retry", entityId: payout.id },
      });
      expect(audit?.oldValue).toMatchObject({
        providerCheckConfirmed: true,
        reason: "PayTR panel: no transfer with this trans_id",
      });
    });
  });

  describe("POST /api/admin/payouts/transfers/:id/mark-paid", () => {
    it("records a transfer the PayTR panel confirms, once, with its ledger and audit", async () => {
      const prisma = getPrisma();
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const payout = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 5,
          netAmount: 95,
          merchantOid: "CONFIRMED1",
          transId: `CONFIRMED${Date.now()}`,
          transferIban: "TR330006100519786457841326",
          transferName: "Test",
          status: PayoutStatus.failed,
          failureReason: "transfer_outcome_unknown",
          submittedAmount: 95,
          submittedTotalAmount: 100,
        },
      });
      const body = {
        method: "paytr_confirmed",
        reference: "PAYTR-PANEL-1",
        reason: "Transfer listed in the PayTR panel",
        expectedNetAmount: 95,
      };

      // The other method does not fit an unknown outcome.
      const wrong = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/transfers/${payout.id}/mark-paid`)
        .set(authHeader(admin))
        .send({ ...body, method: "external_bank" })
        .expect(409);
      expect(wrong.body.i18nKey).toBe("server.admin.payout.markPaidNotAllowed");

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/transfers/${payout.id}/mark-paid`)
        .set(authHeader(admin))
        .send(body)
        .expect(200);
      expect(res.body).toMatchObject({
        success: true,
        method: "paytr_confirmed",
        netAmount: 95,
        platformFundedAmount: 0,
        alreadySettled: false,
      });

      // A second click returns the first result and writes nothing.
      const again = await request(ctx.app.getHttpServer())
        .post(`/api/admin/payouts/transfers/${payout.id}/mark-paid`)
        .set(authHeader(admin))
        .send(body)
        .expect(200);
      expect(again.body.alreadySettled).toBe(true);

      const after = await prisma.payoutTransfer.findUnique({
        where: { id: payout.id },
      });
      expect(after?.status).toBe(PayoutStatus.completed);
      expect(Number(after?.submittedTotalAmount)).toBe(100);
      expect(after?.submittedAt).not.toBeNull();
      const ledger = await prisma.ledgerEntry.findMany({
        where: { payoutId: payout.id },
        orderBy: { lineNo: "asc" },
      });
      expect(
        ledger.map((e) => [
          e.idempotencyKey,
          e.account,
          e.direction,
          Number(e.amount),
        ]),
      ).toEqual([
        [`payout-completed:${payout.id}`, "seller_escrow", "credit", 95],
        [`payout-completed:${payout.id}`, "payout", "debit", 95],
      ]);
      expect(
        await prisma.auditLog.count({
          where: { action: "payout_mark_paid", entityId: payout.id },
        }),
      ).toBe(1);
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
      const statuses = res.body.items.map((i: { status: string }) => i.status);
      expect(statuses).toContain("failed");
      expect(statuses).toContain("returned");
      expect(statuses).not.toContain("completed");
    });
  });
});
