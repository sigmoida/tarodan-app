import * as crypto from "crypto";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  PaymentStatus,
  PaytrMerchant,
  Prisma,
} from "@prisma/client";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import {
  createGroupOrder,
  createGroupPayment,
  createRateSnapshot,
} from "../factories/installment.factory";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import { LedgerService } from "../../src/modules/ledger/ledger.service";
import { PaymentCallbackService } from "../../src/modules/payment/checkout/payment-callback.service";
import { PaymentInitiationService } from "../../src/modules/payment/checkout/payment-initiation.service";
import { EscrowHoldService } from "../../src/modules/payment/fulfillment/escrow-hold.service";
import { FulfillmentFinalizer } from "../../src/modules/payment/fulfillment/fulfillment-finalizer.service";
import { PaymentFulfillmentService } from "../../src/modules/payment/fulfillment/payment-fulfillment.service";
import { InstallmentChargeService } from "../../src/modules/payment/installments/installment-charge.service";
import { InstallmentOptionsService } from "../../src/modules/payment/installments/installment-options.service";
import { InstallmentRatesService } from "../../src/modules/payment/installments/installment-rates.service";
import { InstallmentRulesService } from "../../src/modules/payment/installments/installment-rules.service";
import { InstallmentSettingsService } from "../../src/modules/payment/installments/installment-settings.service";
import { PaymentProviderRegistry } from "../../src/modules/payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../src/modules/payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../src/modules/payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../src/modules/payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../src/modules/payment-providers/paytr/paytr.service";

/**
 * Installment signing, callback, capture and ledger on a real database (ADR
 * 0019, task A4). No app boot: the real initiation, callback, fulfillment,
 * finalizer and ledger services run on Prisma against the real triggers and
 * CHECKs (`payment_charge_attempts_guard`, `payments_charge_attempt_guard`,
 * `payments_charged_amount_check`, append-only ledger). The PayTR client is
 * real for signing and hash checks; nothing calls PayTR (the BIN answer is a
 * fake, `fetch` is never used). Notifications, stock and e-mail are stubs.
 *
 * Plan 4.4: a 1,000.00 TL cart of two sellers (600.00 and 400.00), card
 * family `world`, r1 = 3 %, r3 = 8 %, default rule: C = 1,066.38, F = 66.38
 * split 39.83 / 26.55.
 */
describe("installment capture on a real database (E2E)", () => {
  const prisma = getPrisma();
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
  const ENV: Record<string, string> = {
    PAYTR_MERCHANT_ID: "111111",
    PAYTR_MERCHANT_KEY: "e2e-market-key",
    PAYTR_MERCHANT_SALT: "e2e-market-salt",
    PAYTR_TEST_MODE: "true",
    FRONTEND_URL: "https://app.test",
  };
  const config = {
    get: (key: string, fallback?: string) => ENV[key] ?? fallback,
  } as unknown as ConfigService;
  const creds = new PayTRCredentials(config);
  const registry = new PaymentProviderRegistry(
    new PayTRService(
      creds,
      new PayTRReportService(creds),
      new PayTRTransferService(creds),
      config,
    ),
  );

  // Redis stand-in; the BIN answer is cached, so PayTR is never asked.
  const store = new Map<string, unknown>([
    [
      "paytr:bin:45467112",
      {
        outcome: "success",
        bank: "Test Bank",
        cardType: "credit",
        family: "world",
        businessCard: false,
      },
    ],
  ]);
  const cache = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async () => undefined,
    delPattern: async () => undefined,
    claimKey: async () => "held" as const,
    incr: async () => 1,
  };
  const noPaytr = {
    resolve: () => {
      throw new Error("PayTR must not be called in this test");
    },
  };
  const settings = new InstallmentSettingsService(prisma as never);
  const rates = new InstallmentRatesService(
    prisma as never,
    cache as never,
    noPaytr as never,
    settings,
  );
  const options = new InstallmentOptionsService(
    prisma as never,
    cache as never,
    noPaytr as never,
    settings,
    rates,
    new InstallmentRulesService(prisma as never, rates),
  );
  const charge = new InstallmentChargeService(options);

  const initiation = new PaymentInitiationService(
    prisma as never,
    config,
    registry,
    {} as never,
    {} as never,
    {} as never,
    { verifyPaymentFromClient: async () => ({ completed: false }) } as never,
    { record: async () => undefined } as never,
    { ensureForPayment: async () => null } as never,
    { isRecordedForOrder: async () => true } as never,
    charge,
  );

  const events = {
    emitOrderFulfillmentRequested: jest.fn(async () => undefined),
    emitGroupBuyerOrderPaid: jest.fn(async (_payload: unknown) => undefined),
    emitOrderPaid: jest.fn(async () => undefined),
  };
  const anyCall = new Proxy({}, { get: () => jest.fn(async () => undefined) });
  const fulfillment = new PaymentFulfillmentService(
    prisma as never,
    cache as never,
    config,
    events as never,
    { notifyStockoutCascade: async () => undefined } as never,
    {} as never,
    {
      decrementForOrder: async () => ({
        cancelledOrders: [],
        cancelledOffers: [],
        stockoutCategoryId: undefined,
        oversold: undefined,
      }),
    } as never,
    anyCall as never,
    new EscrowHoldService(new CommissionLedgerService(prisma as never)),
    {} as never,
    {} as never,
    {} as never,
  );
  const callbacks = new PaymentCallbackService(
    prisma as never,
    config,
    registry,
    { isChargeLikelyLive: () => false } as never,
    fulfillment,
    { syncSavedCardsFromUtoken: async () => undefined } as never,
    { record: async () => undefined } as never,
    cache as never,
  );
  const finalizer = new FulfillmentFinalizer(
    prisma as never,
    events as never,
    { ensure: async () => "created" } as never,
    new LedgerService(prisma as never),
  );

  /** A cart of two sellers' orders, 600.00 and 400.00, 10 % commission. */
  async function cart() {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const orders = [];
    for (const total of ["600.00", "400.00"]) {
      const { orderId } = await createGroupOrder(payment, {
        totalAmount: total,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { commissionAmount: D(total).times("0.1") },
      });
      orders.push(orderId);
    }
    return { ...payment, orderIds: orders };
  }

  /** Signs the cart's card form; returns the signed fields. */
  async function sign(
    target: Awaited<ReturnType<typeof cart>>,
    installment?: { count: number; bin?: string; expectedTotal: number },
  ) {
    const form = await initiation.prepareDirectPayment(target.buyerId, {
      checkoutGroupId: target.groupId,
      ...(installment ? { installment } : {}),
    });
    return Object.fromEntries(form.fields.map((f) => [f.name, f.value]));
  }

  function signedCallback(oid: string, totalKurus: string, count: string) {
    const hash = crypto
      .createHmac("sha256", ENV.PAYTR_MERCHANT_KEY)
      .update(`${oid}${ENV.PAYTR_MERCHANT_SALT}success${totalKurus}`)
      .digest("base64");
    return {
      merchant_oid: oid,
      status: "success",
      total_amount: totalKurus,
      hash,
      payment_type: "card",
      installment_count: count,
      currency: "TL",
    };
  }

  /** Runs the post-commit ledger capture as the fulfillment listener does. */
  async function finalize(paymentId: string) {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const orders = await prisma.order.findMany({
      where: { checkoutGroupId: payment.checkoutGroupId },
      include: { buyer: true, seller: true, product: true },
    });
    for (const order of orders) {
      await finalizer.finalizePaidOrder(order, payment, { skipBuyer: true });
    }
  }

  async function captureLines(orderId: string) {
    const rows = await prisma.ledgerEntry.findMany({
      where: { orderId, eventType: LedgerEventType.payment_captured },
    });
    const amountOf = (account: LedgerAccount, direction: LedgerDirection) =>
      rows
        .filter((r) => r.account === account && r.direction === direction)
        .reduce((sum, r) => sum.plus(r.amount), D(0))
        .toFixed(2);
    const net = rows.reduce(
      (sum, r) =>
        r.direction === LedgerDirection.debit
          ? sum.plus(r.amount)
          : sum.minus(r.amount),
      D(0),
    );
    return {
      buyerPayment: amountOf(
        LedgerAccount.buyer_payment,
        LedgerDirection.credit,
      ),
      installmentFee: amountOf(
        LedgerAccount.installment_fee,
        LedgerDirection.debit,
      ),
      sellerEscrow: amountOf(
        LedgerAccount.seller_escrow,
        LedgerDirection.debit,
      ),
      net: net.toFixed(2),
    };
  }

  beforeAll(async () => {
    await prisma.installmentRule.updateMany({
      where: { archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: "e2e-reset" },
    });
    for (const [settingKey, settingValue, settingType] of [
      ["installments_enabled", "true", "boolean"],
      ["installment_min_amount", "500", "number"],
    ]) {
      await prisma.platformSetting.upsert({
        where: { settingKey },
        update: { settingValue },
        create: { settingKey, settingValue, settingType },
      });
    }
    await createRateSnapshot({
      maxInstallmentNonBusiness: 6,
      rates: { world: { "3": "8", "6": "13" } },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("signs C, captures the attempt through the triggers, splits F and books the ledger", async () => {
    const target = await cart();

    const fields = await sign(target, {
      count: 3,
      bin: "45467112",
      expectedTotal: 1066.38,
    });
    expect(fields.payment_amount).toBe("1066.38");
    expect(fields.installment_count).toBe("3");
    expect(fields.card_type).toBe("world");

    const attempt = await prisma.paymentChargeAttempt.findUniqueOrThrow({
      where: { merchantOid: fields.merchant_oid },
    });
    expect(attempt).toMatchObject({
      paymentId: target.paymentId,
      paytrMerchant: PaytrMerchant.marketplace,
      installmentCount: 3,
      buyerSegment: "free",
      installmentRuleId: null,
      cardFamily: "world",
      cardBank: "Test Bank",
      bin6: "454671",
      capturedAt: null,
    });
    expect(attempt.chargedAmount.toFixed(2)).toBe("1066.38");
    expect(attempt.installmentFeeAmount.toFixed(2)).toBe("66.38");
    expect(attempt.rateSnapshotId).not.toBeNull();

    await expect(
      callbacks.handlePayTRCallback(
        signedCallback(fields.merchant_oid, "106638", "3"),
      ),
    ).resolves.toBe("OK");

    const paid = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(paid).toMatchObject({
      status: PaymentStatus.completed,
      chargeAttemptId: attempt.id,
      installmentCount: 3,
      providerConversationId: fields.merchant_oid,
    });
    expect(paid.amount.toFixed(2)).toBe("1000.00");
    expect(paid.chargedAmount?.toFixed(2)).toBe("1066.38");
    expect(paid.installmentFeeAmount.toFixed(2)).toBe("66.38");
    const captured = await prisma.paymentChargeAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(captured.capturedAt).not.toBeNull();

    const orders = await prisma.order.findMany({
      where: { id: { in: target.orderIds } },
      select: { id: true, totalAmount: true, installmentFeeAmount: true },
    });
    const feeOf = (total: string) =>
      orders
        .find((o) => o.totalAmount.toFixed(2) === total)
        ?.installmentFeeAmount.toFixed(2);
    expect(feeOf("600.00")).toBe("39.83");
    expect(feeOf("400.00")).toBe("26.55");

    // The cart e-mail gets the installment line from the captured row.
    expect(events.emitGroupBuyerOrderPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        installment: expect.objectContaining({
          summary:
            "3 taksit: aylık 355,46 TL, vade farkı 66,38 TL, toplam 1.066,38 TL",
        }),
      }),
    );

    await finalize(target.paymentId);
    const [big, small] = await Promise.all(
      [
        orders.find((o) => o.totalAmount.toFixed(2) === "600.00"),
        orders.find((o) => o.totalAmount.toFixed(2) === "400.00"),
      ].map((o) => captureLines(o?.id as string)),
    );
    expect(big).toEqual({
      buyerPayment: "639.83",
      installmentFee: "39.83",
      sellerEscrow: "540.00",
      net: "0.00",
    });
    expect(small).toEqual({
      buyerPayment: "426.55",
      installmentFee: "26.55",
      sellerEscrow: "360.00",
      net: "0.00",
    });
    // The seller's holds stay on the goods scale: the same as paid in one.
    const holds = await prisma.paymentHold.findMany({
      where: { paymentId: target.paymentId },
      select: { amount: true },
    });
    expect(holds.map((h) => h.amount.toFixed(2)).sort()).toEqual([
      "360.00",
      "540.00",
    ]);

    // A duplicate callback and a second finalize (the outbox backstop)
    // change nothing: same attempt, fee shares, stamp and ledger.
    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "106638", "3"),
    );
    await finalize(target.paymentId);
    const again = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(again.chargeAttemptId).toBe(attempt.id);
    expect(again.chargedAmount?.toFixed(2)).toBe("1066.38");
    const feesAgain = await prisma.order.findMany({
      where: { id: { in: target.orderIds } },
      select: { installmentFeeAmount: true },
    });
    expect(
      feesAgain.map((o) => o.installmentFeeAmount.toFixed(2)).sort(),
    ).toEqual(["26.55", "39.83"]);
    const stampedAgain = await prisma.paymentChargeAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stampedAgain.capturedAt).toEqual(captured.capturedAt);
    await expect(
      captureLines(
        orders.find((o) => o.totalAmount.toFixed(2) === "600.00")?.id as string,
      ),
    ).resolves.toEqual(big);

    // Why the initiate retry paths refuse a captured row: the DB refuses to
    // move `amount` under the captured charged amount.
    await expect(
      prisma.payment.update({
        where: { id: target.paymentId },
        data: { amount: D("999.00") },
      }),
    ).rejects.toThrow(/payments_charged_amount_check/);
  });

  it("captures a late callback of a superseded installment attempt at its own C", async () => {
    const target = await cart();
    const first = await sign(target, {
      count: 3,
      bin: "45467112",
      expectedTotal: 1066.38,
    });
    // The buyer comes back and signs a single-payment form: a new oid.
    const second = await sign(target);
    expect(second.merchant_oid).not.toBe(first.merchant_oid);
    expect(second.payment_amount).toBe("1000.00");
    expect(
      await prisma.paymentChargeAttempt.count({
        where: { paymentId: target.paymentId },
      }),
    ).toBe(2);

    // PayTR reports the FIRST form, paid at C.
    await callbacks.handlePayTRCallback(
      signedCallback(first.merchant_oid, "106638", "3"),
    );

    const paid = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
      include: { chargeAttempt: true },
    });
    expect(paid.status).toBe(PaymentStatus.completed);
    expect(paid.chargeAttempt?.merchantOid).toBe(first.merchant_oid);
    expect(paid.chargedAmount?.toFixed(2)).toBe("1066.38");
    expect(paid.providerConversationId).toBe(first.merchant_oid);

    // The second form paid as well (a double charge): the captured payment
    // keeps the first attempt; the second stays uncaptured for review.
    await callbacks.handlePayTRCallback(
      signedCallback(second.merchant_oid, "100000", "0"),
    );
    const still = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
      include: { chargeAttempt: true },
    });
    expect(still.chargeAttempt?.merchantOid).toBe(first.merchant_oid);
    expect(still.chargedAmount?.toFixed(2)).toBe("1066.38");
    expect(still.providerConversationId).toBe(first.merchant_oid);
    const secondAttempt = await prisma.paymentChargeAttempt.findUniqueOrThrow({
      where: { merchantOid: second.merchant_oid },
    });
    expect(secondAttempt.capturedAt).toBeNull();
  });

  it("does not complete an installment oid that PayTR reports at T", async () => {
    const target = await cart();
    const fields = await sign(target, {
      count: 3,
      bin: "45467112",
      expectedTotal: 1066.38,
    });

    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "100000", "3"),
    );

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(payment.status).not.toBe(PaymentStatus.completed);
    expect(payment.chargeAttemptId).toBeNull();
  });

  describe("an attempt priced from another T than the payment's amount", () => {
    let errorLog: jest.SpyInstance;
    beforeEach(() => {
      errorLog = jest.spyOn(Logger.prototype, "error");
    });
    afterEach(() => errorLog.mockRestore());

    /** Signs 3 x at T 1,000.00 (C 1,066.38), then moves the amount outside the card flow. */
    async function signedThenMoved(amount: string) {
      const target = await cart();
      const fields = await sign(target, {
        count: 3,
        bin: "45467112",
        expectedTotal: 1066.38,
      });
      await prisma.payment.update({
        where: { id: target.paymentId },
        data: { amount: D(amount) },
      });
      return { target, fields };
    }

    it("leaves an under-collected payment pending: no capture, no hold, no ledger, alarm", async () => {
      const { target, fields } = await signedThenMoved("1100.00");

      await expect(
        callbacks.handlePayTRCallback(
          signedCallback(fields.merchant_oid, "106638", "3"),
        ),
      ).resolves.toBe("OK");

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: target.paymentId },
      });
      expect(payment.status).toBe(PaymentStatus.pending);
      expect(payment.chargeAttemptId).toBeNull();
      expect(payment.chargedAmount).toBeNull();
      const attempt = await prisma.paymentChargeAttempt.findUniqueOrThrow({
        where: { merchantOid: fields.merchant_oid },
      });
      expect(attempt.capturedAt).toBeNull();
      expect(
        await prisma.paymentHold.count({
          where: { paymentId: target.paymentId },
        }),
      ).toBe(0);
      expect(
        await prisma.ledgerEntry.count({
          where: { orderId: { in: target.orderIds } },
        }),
      ).toBe(0);
      const orders = await prisma.order.findMany({
        where: { id: { in: target.orderIds } },
        select: { status: true, installmentFeeAmount: true },
      });
      expect(orders.map((o) => o.status)).toEqual([
        "pending_payment",
        "pending_payment",
      ]);
      expect(orders.map((o) => o.installmentFeeAmount.toFixed(2))).toEqual([
        "0.00",
        "0.00",
      ]);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringMatching(
          /CHARGE_ATTEMPT_BASE_MISMATCH .*payment NOT completed \(left pending\)/,
        ),
      );
    });

    it("completes a charge that covers the amount legacy-style, with the alarm", async () => {
      const { target, fields } = await signedThenMoved("1050.00");

      await callbacks.handlePayTRCallback(
        signedCallback(fields.merchant_oid, "106638", "3"),
      );

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: target.paymentId },
      });
      expect(payment.status).toBe(PaymentStatus.completed);
      expect(payment.chargeAttemptId).toBeNull();
      expect(payment.chargedAmount).toBeNull();
      expect(payment.installmentFeeAmount.toFixed(2)).toBe("0.00");
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringMatching(
          /CHARGE_ATTEMPT_BASE_MISMATCH .*captured without the attempt/,
        ),
      );
    });
  });

  it("refuses a total the buyer was not shown without claiming or writing an attempt", async () => {
    const target = await cart();
    await expect(
      sign(target, { count: 3, bin: "45467112", expectedTotal: 1060 }),
    ).rejects.toMatchObject({ status: 409 });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(payment.status).toBe(PaymentStatus.pending);
    expect(payment.providerConversationId).toBeNull();
    expect(
      await prisma.paymentChargeAttempt.count({
        where: { paymentId: target.paymentId },
      }),
    ).toBe(0);
  });

  it("pays the seller the same for the same cart paid in one", async () => {
    const target = await cart();
    const fields = await sign(target);
    expect(fields.installment_count).toBe("0");
    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "100000", "0"),
    );
    const paid = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(paid.status).toBe(PaymentStatus.completed);
    expect(paid.installmentCount).toBe(1);
    expect(paid.chargedAmount?.toFixed(2)).toBe("1000.00");
    expect(paid.installmentFeeAmount.toFixed(2)).toBe("0.00");

    await finalize(target.paymentId);
    const lines = await Promise.all(target.orderIds.map(captureLines));
    expect(lines.map((l) => l.sellerEscrow).sort()).toEqual([
      "360.00",
      "540.00",
    ]);
    expect(lines.map((l) => l.installmentFee)).toEqual(["0.00", "0.00"]);
    const holds = await prisma.paymentHold.findMany({
      where: { paymentId: target.paymentId },
      select: { amount: true },
    });
    expect(holds.map((h) => h.amount.toFixed(2)).sort()).toEqual([
      "360.00",
      "540.00",
    ]);
  });
});
