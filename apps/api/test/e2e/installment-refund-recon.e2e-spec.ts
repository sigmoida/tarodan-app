import * as crypto from "crypto";
import type { ConfigService } from "@nestjs/config";
import {
  CancellationActor,
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  OrderStatus,
  PaymentStatus,
  PaytrMatchStatus,
  PaytrStatementLineType,
  Prisma,
  RefundAttemptStatus,
} from "@prisma/client";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import {
  createGroupOrder,
  createGroupPayment,
  createInstallmentRule,
  createRateSnapshot,
} from "../factories/installment.factory";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import { loadInstallmentSummary } from "../../src/modules/finance-reconciliation/helpers/installment-summary";
import { RevenueSplitService } from "../../src/modules/finance-reconciliation/revenue-split.service";
import { LedgerReconciliationService } from "../../src/modules/ledger/ledger-reconciliation.service";
import { LedgerService } from "../../src/modules/ledger/ledger.service";
import { PaymentCallbackService } from "../../src/modules/payment/checkout/payment-callback.service";
import { PaymentInitiationService } from "../../src/modules/payment/checkout/payment-initiation.service";
import { EscrowHoldService } from "../../src/modules/payment/fulfillment/escrow-hold.service";
import { FulfillmentFinalizer } from "../../src/modules/payment/fulfillment/fulfillment-finalizer.service";
import { PaymentFulfillmentService } from "../../src/modules/payment/fulfillment/payment-fulfillment.service";
import { orderChargedTotalOf } from "../../src/modules/payment/helpers/charged-amount";
import { InstallmentChargeService } from "../../src/modules/payment/installments/installment-charge.service";
import { InstallmentOptionsService } from "../../src/modules/payment/installments/installment-options.service";
import { InstallmentRatesService } from "../../src/modules/payment/installments/installment-rates.service";
import { InstallmentRulesService } from "../../src/modules/payment/installments/installment-rules.service";
import { InstallmentSettingsService } from "../../src/modules/payment/installments/installment-settings.service";
import { PaytrReportMatchingService } from "../../src/modules/payment/reconciliation/paytr-report-matching.service";
import { PaymentRefundAttemptService } from "../../src/modules/payment/refund/payment-refund-attempt.service";
import { PaymentRefundService } from "../../src/modules/payment/refund/payment-refund.service";
import { PaymentProviderRegistry } from "../../src/modules/payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../src/modules/payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../src/modules/payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../src/modules/payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../src/modules/payment-providers/paytr/paytr.service";
import { resolveTransferTotal } from "../../src/modules/payout/helpers/transfer-total";

/**
 * Refunds, transfer totals and PSP reconciliation of installment payments on
 * a real database (ADR 0019, task A5). No app boot: the real initiation,
 * callback, fulfillment, ledger, refund, report matching and reconciliation
 * services run on Prisma against the real triggers and CHECKs (refund
 * attempts' fee CHECK, append-only ledger). PayTR is a mock: signing and
 * hashes use the real client, refunds go to a recording fake.
 *
 * Plan 4.4: a 1,000.00 TL cart of two sellers (600.00 and 400.00, 10 %
 * commission), card family `world`, r1 = 3 %, r3 = 8 %: default rule
 * C = 1,066.38, F = 66.38 split 39.83 / 26.55; a 100 % share rule makes
 * C = T and P = 50.00.
 */
describe("installment refunds and reconciliation on a real database (E2E)", () => {
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
  const paytr = new PayTRService(
    creds,
    new PayTRReportService(creds),
    new PayTRTransferService(creds),
    config,
  );
  const registry = new PaymentProviderRegistry(paytr);

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
    exists: async () => false,
  };
  const noPaytr = {
    resolve: () => {
      throw new Error("PayTR must not be called for options");
    },
  };
  const settings = new InstallmentSettingsService(prisma as never);
  const rates = new InstallmentRatesService(
    prisma as never,
    cache as never,
    noPaytr as never,
    settings,
  );
  const charge = new InstallmentChargeService(
    new InstallmentOptionsService(
      prisma as never,
      cache as never,
      noPaytr as never,
      settings,
      rates,
      new InstallmentRulesService(prisma as never, rates),
    ),
  );
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

  /** PayTR's refund API, recorded: (oid, return_amount TL, reference). */
  const paytrRefunds: Array<[string, number, string]> = [];
  const refundRegistry = {
    resolve: () => ({
      createRefund: async (oid: string, amount: number, ref: string) => {
        paytrRefunds.push([oid, amount, ref]);
        return { status: "success", merchant_oid: oid };
      },
    }),
  };
  const anyCall = new Proxy({}, { get: () => jest.fn(async () => undefined) });
  const ledger = new LedgerService(prisma as never);
  const commissionLedger = new CommissionLedgerService(prisma as never);
  const refunds = new PaymentRefundService(
    prisma as never,
    config,
    refundRegistry as never,
    anyCall as never, // events
    anyCall as never, // notifications
    commissionLedger,
    { handleOrderRefund: async () => undefined } as never,
    { cancelSuratShipmentIfExists: async () => undefined } as never,
    { record: async () => undefined } as never,
    {} as never, // holdRelease
    new PaymentRefundAttemptService(prisma as never),
    {} as never, // tradeRefunds
    {} as never, // boostTimeline (no boost order here)
    undefined, // outbox
    ledger,
  );

  const events = {
    emitOrderFulfillmentRequested: jest.fn(async () => undefined),
    emitGroupBuyerOrderPaid: jest.fn(async (_payload: unknown) => undefined),
    emitOrderPaid: jest.fn(async () => undefined),
  };
  const fulfillment = new PaymentFulfillmentService(
    prisma as never,
    cache as never,
    config,
    events as never,
    {
      notifyStockoutCascade: async () => undefined,
    } as never,
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
    new EscrowHoldService(commissionLedger),
    {} as never,
    refunds,
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
    ledger,
  );
  const matching = new PaytrReportMatchingService(prisma as never, ledger);
  const revenueSplit = new RevenueSplitService(prisma as never, config);
  const ledgerReconciliation = new LedgerReconciliationService(
    prisma as never,
    config,
    {} as never,
  );

  /** A cart of two sellers' orders, 600.00 and 400.00, 10 % commission. */
  async function cart() {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const orders: { big: string; small: string } = { big: "", small: "" };
    for (const [name, total] of [
      ["big", "600.00"],
      ["small", "400.00"],
    ] as const) {
      const { orderId } = await createGroupOrder(payment, {
        totalAmount: total,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { commissionAmount: D(total).times("0.1") },
      });
      orders[name] = orderId;
    }
    return { ...payment, orders };
  }

  /**
   * One order of 1,000.00 (commission 100) paid alone: a refund can come in
   * several parts (a cart order is refunded once, `orderAlreadyRefunded`).
   */
  async function singleOrder() {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const { orderId } = await createGroupOrder(payment, {
      totalAmount: "1000.00",
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { checkoutGroupId: null, commissionAmount: D("100.00") },
    });
    await prisma.payment.update({
      where: { id: payment.paymentId },
      data: { checkoutGroupId: null, orderId },
    });
    return { ...payment, orderId };
  }

  async function sign(
    target: { buyerId: string; groupId: string; orderId?: string },
    total: number,
  ) {
    const form = await initiation.prepareDirectPayment(target.buyerId, {
      ...(target.orderId
        ? { orderId: target.orderId }
        : { checkoutGroupId: target.groupId }),
      installment: { count: 3, bin: "45467112", expectedTotal: total },
    });
    return Object.fromEntries(form.fields.map((f) => [f.name, f.value]));
  }

  function signedCallback(oid: string, totalKurus: string) {
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
      installment_count: "3",
      currency: "TL",
    };
  }

  /** Runs the post-commit ledger capture as the fulfillment listener does. */
  async function finalize(paymentId: string) {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const orders = await prisma.order.findMany({
      where: {
        ...(payment.orderId
          ? { id: payment.orderId }
          : { checkoutGroupId: payment.checkoutGroupId }),
        status: { not: OrderStatus.cancelled },
      },
      include: { buyer: true, seller: true, product: true },
    });
    for (const order of orders) {
      await finalizer.finalizePaidOrder(order, payment, { skipBuyer: true });
    }
  }

  /** Signs and captures a default-rule cart (C 1,066.38), ledger booked. */
  async function capturedCart() {
    const target = await cart();
    const fields = await sign(target, 1066.38);
    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "106638"),
    );
    await finalize(target.paymentId);
    return { ...target, oid: fields.merchant_oid };
  }

  /** An order's ledger: signed balance per account (debit +, credit -). */
  async function ledgerOf(orderId: string) {
    const rows = await prisma.ledgerEntry.findMany({ where: { orderId } });
    const balance = (account: LedgerAccount) =>
      rows
        .filter((r) => r.account === account)
        .reduce(
          (sum, r) =>
            r.direction === LedgerDirection.debit
              ? sum.plus(r.amount)
              : sum.minus(r.amount),
          D(0),
        )
        .toFixed(2);
    const groups = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      const signed =
        r.direction === LedgerDirection.debit ? r.amount : r.amount.neg();
      groups.set(
        r.entryGroupId,
        (groups.get(r.entryGroupId) ?? D(0)).plus(signed),
      );
    }
    return {
      rows,
      balance,
      unbalancedGroups: [...groups.values()].filter((v) => !v.isZero()).length,
    };
  }

  async function refundLines(attemptId: string) {
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        eventType: LedgerEventType.refund_issued,
        idempotencyKey: `refund:attempt:${attemptId}`,
      },
    });
    return Object.fromEntries(
      rows.map((r) => [`${r.account}:${r.direction}`, r.amount.toFixed(2)]),
    );
  }

  async function attemptsOf(paymentId: string) {
    return prisma.refundAttempt.findMany({
      where: { paymentId },
      orderBy: { createdAt: "asc" },
    });
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

  beforeEach(() => {
    paytrRefunds.length = 0;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("refunds one installment order in two parts: 426.55 then 639.83 (plan 4.4), Σ fee = F, ledger closed", async () => {
    const summaryBefore = await loadInstallmentSummary(prisma);
    const target = await singleOrder();
    const fields = await sign(target, 1066.38);
    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "106638"),
    );
    await finalize(target.paymentId);

    // 400.00 of goods: fee share round2(66.38 * 0.4) = 26.55.
    const first = await refunds.processRefund(target.orderId, 400, {
      idempotencyKey: `e2e-a5-part-1:${target.paymentId}`,
      cancelledBy: CancellationActor.buyer,
    });
    expect(first).toMatchObject({
      refundAmount: 400,
      installmentFeeRefunded: 26.55,
      cashRefunded: 426.55,
    });
    let attempts = await attemptsOf(target.paymentId);
    expect(await refundLines(attempts[0].id)).toEqual({
      "refund:debit": "426.55",
      "installment_fee:credit": "26.55",
      // Goods ratio 0.4: commission 100 * 0.4 = 40, escrow 400 - 40 = 360.
      "platform_commission:credit": "40.00",
      "seller_escrow:credit": "360.00",
    });
    const hold = await prisma.paymentHold.findFirstOrThrow({
      where: { orderId: target.orderId },
    });
    expect(hold.amount.toFixed(2)).toBe("900.00");
    expect(hold.refundedAmount.toFixed(2)).toBe("360.00");

    // The transfer slice after the partial refund, on the PSP scale:
    // 1,066.38 - 426.55 = 639.83, against the seller's net 540.
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: target.orderId },
    });
    const slice = await resolveTransferTotal(prisma as never, {
      payout: { id: "e2e-none", merchantOid: fields.merchant_oid },
      net: 540,
      source: { key: target.orderId, total: orderChargedTotalOf(order) },
      payment,
    });
    expect(slice).toMatchObject({
      kind: "send",
      totalAmount: 639.83,
      snapshot: { net: 540, paymentAmount: 1066.38, paymentRefunded: 426.55 },
    });

    // The rest, 600.00, completes the order: it takes the rest of F.
    await refunds.processRefund(target.orderId, 600, {
      idempotencyKey: `e2e-a5-part-2:${target.paymentId}`,
      cancelledBy: CancellationActor.buyer,
    });

    expect(paytrRefunds.map(([oid, amount]) => [oid, amount])).toEqual([
      [fields.merchant_oid, 426.55],
      [fields.merchant_oid, 639.83],
    ]);
    attempts = await attemptsOf(target.paymentId);
    expect(
      attempts.map((a) => [
        a.amount.toFixed(2),
        a.installmentFeeAmount.toFixed(2),
        a.status,
      ]),
    ).toEqual([
      ["426.55", "26.55", RefundAttemptStatus.finalized],
      ["639.83", "39.83", RefundAttemptStatus.finalized],
    ]);
    const paid = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    expect(paid.status).toBe(PaymentStatus.refunded);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: target.orderId } }))
        .status,
    ).toBe(OrderStatus.cancelled);

    // The capture's installment_fee debit is fully reversed, the escrow and
    // commission close, every group balances, cash out = cash in (C).
    const l = await ledgerOf(target.orderId);
    expect(l.unbalancedGroups).toBe(0);
    expect(l.balance(LedgerAccount.installment_fee)).toBe("0.00");
    expect(l.balance(LedgerAccount.seller_escrow)).toBe("0.00");
    expect(l.balance(LedgerAccount.platform_commission)).toBe("0.00");
    expect(l.balance(LedgerAccount.refund)).toBe("1066.38");
    expect(l.balance(LedgerAccount.buyer_payment)).toBe("-1066.38");
    const report = await ledgerReconciliation.reconcile();
    expect(
      report.driftAlarms.filter((a) => a.includes(target.orderId)),
    ).toEqual([]);

    // Finance rows: 66.38 collected and 66.38 refunded, no income kept.
    const summaryAfter = await loadInstallmentSummary(prisma);
    const delta = (key: "feeCollected" | "feeRefunded" | "feeIncomeNet") =>
      D(summaryAfter.totals[key]).minus(summaryBefore.totals[key]).toFixed(2);
    expect(delta("feeCollected")).toBe("66.38");
    expect(delta("feeRefunded")).toBe("66.38");
    expect(delta("feeIncomeNet")).toBe("0.00");
  });

  it("refunds a cart order by order: each takes its own share, a partly kept order keeps the share of what it kept", async () => {
    const target = await capturedCart();

    // 160.00 of the small order's goods (0.4 of 400.00): share
    // round2(26.55 * 0.4) = 10.62, PayTR 170.62. The buyer keeps the rest.
    await refunds.processRefund(target.orders.small, 160, {
      idempotencyKey: `e2e-a5-cart-small:${target.paymentId}`,
      cancelledBy: CancellationActor.buyer,
    });
    const [smallAttempt] = await attemptsOf(target.paymentId);
    expect(await refundLines(smallAttempt.id)).toEqual({
      "refund:debit": "170.62",
      "installment_fee:credit": "10.62",
      "platform_commission:credit": "16.00",
      "seller_escrow:credit": "144.00",
    });

    // The transfer slices of the cart on the PSP scale after that refund.
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: target.paymentId },
    });
    const orderRows = await prisma.order.findMany({
      where: { id: { in: [target.orders.big, target.orders.small] } },
    });
    const sliceOf = async (orderId: string, net: number) => {
      const order = orderRows.find((o) => o.id === orderId);
      if (!order) throw new Error(`no order ${orderId}`);
      const decision = await resolveTransferTotal(prisma as never, {
        payout: { id: `e2e-${orderId}`, merchantOid: target.oid },
        net,
        source: { key: orderId, total: orderChargedTotalOf(order) },
        payment,
      });
      return decision.snapshot.allowedTotal;
    };
    expect(await sliceOf(target.orders.big, 540)).toBe(639.83);
    expect(await sliceOf(target.orders.small, 216)).toBe(255.93);

    // The big order in full: its own share 39.83, PayTR 639.83.
    await refunds.processRefund(target.orders.big, undefined, {
      cancelledBy: CancellationActor.platform,
    });

    expect(paytrRefunds.map(([oid, amount]) => [oid, amount])).toEqual([
      [target.oid, 170.62],
      [target.oid, 639.83],
    ]);
    const big = await ledgerOf(target.orders.big);
    expect(big.unbalancedGroups).toBe(0);
    expect(big.balance(LedgerAccount.installment_fee)).toBe("0.00");
    expect(big.balance(LedgerAccount.seller_escrow)).toBe("0.00");
    // The small order's buyer kept 240.00 of goods, and 15.93 of the fee
    // stays with them: 26.55 - 10.62.
    const small = await ledgerOf(target.orders.small);
    expect(small.unbalancedGroups).toBe(0);
    expect(small.balance(LedgerAccount.installment_fee)).toBe("15.93");
    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: target.paymentId },
        })
      ).status,
    ).toBe(PaymentStatus.completed);
  });

  it("a replay of a finished refund changes nothing; the same key with another amount is refused", async () => {
    const target = await capturedCart();
    await refunds.processRefund(target.orders.small, 160, {
      idempotencyKey: `e2e-a5-replay:${target.paymentId}`,
      cancelledBy: CancellationActor.buyer,
    });
    const again = await refunds.processRefund(target.orders.small, 160, {
      idempotencyKey: `e2e-a5-replay:${target.paymentId}`,
      cancelledBy: CancellationActor.buyer,
    });
    expect(again).toMatchObject({ idempotent: true, cashRefunded: 170.62 });
    await expect(
      refunds.processRefund(target.orders.small, 170.62, {
        idempotencyKey: `e2e-a5-replay:${target.paymentId}`,
        cancelledBy: CancellationActor.buyer,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(paytrRefunds).toHaveLength(1);
    expect(await attemptsOf(target.paymentId)).toHaveLength(1);
  });

  it("auto-refunds an order cancelled before its capture with T_o + F_o", async () => {
    const target = await cart();
    const fields = await sign(target, 1066.38);
    // The 24-hour sweep cancels the small order while the buyer pays.
    await prisma.order.update({
      where: { id: target.orders.small },
      data: { status: OrderStatus.cancelled },
    });

    await callbacks.handlePayTRCallback(
      signedCallback(fields.merchant_oid, "106638"),
    );

    const small = await prisma.order.findUniqueOrThrow({
      where: { id: target.orders.small },
    });
    expect(small.installmentFeeAmount.toFixed(2)).toBe("26.55");
    expect(paytrRefunds.map(([oid, amount]) => [oid, amount])).toEqual([
      [fields.merchant_oid, 426.55],
    ]);
    const [attempt] = await attemptsOf(target.paymentId);
    expect(attempt).toMatchObject({
      orderId: target.orders.small,
      status: RefundAttemptStatus.finalized,
    });
    expect(attempt.installmentFeeAmount.toFixed(2)).toBe("26.55");
    const big = await prisma.order.findUniqueOrThrow({
      where: { id: target.orders.big },
    });
    expect(big.status).toBe(OrderStatus.preparing);
  });

  it("books a segment-rule sale's deduction as psp_fee + installment_platform_cost and keeps the ledger check green", async () => {
    const rule = await createInstallmentRule({
      name: "E2E free 3 taksit vade farksiz",
      segment: "free",
      minCount: 3,
      maxCount: 3,
      platformSharePct: D("100.00"),
    });
    try {
      const target = await cart();
      const before = await revenueSplit.compute();
      const summaryBefore = await loadInstallmentSummary(prisma);
      // 100 % share: C = T = 1,000.00, P = T * (8 % - 3 %) = 50.00.
      const fields = await sign(target, 1000);
      expect(fields.payment_amount).toBe("1000.00");
      const attempt = await prisma.paymentChargeAttempt.findUniqueOrThrow({
        where: { merchantOid: fields.merchant_oid },
      });
      expect(attempt.platformCostAmount.toFixed(2)).toBe("50.00");
      await callbacks.handlePayTRCallback(
        signedCallback(fields.merchant_oid, "100000"),
      );
      await finalize(target.paymentId);

      // The next day's statement: the sale at 8 % deducted, the card that
      // was quoted.
      const line = await prisma.paytrStatementLine.create({
        data: {
          merchantOid: fields.merchant_oid,
          type: PaytrStatementLineType.sale,
          amount: D("1000.00"),
          fee: D("80.00"),
          feeRate: D("8.000"),
          net: D("920.00"),
          installment: 3,
          cardBrand: "WORLD",
          maskedPan: "454671******1234",
          transactionDate: new Date(
            `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
          ),
        },
      });
      await matching.matchStatementLines();
      const matched = await prisma.paytrStatementLine.findUniqueOrThrow({
        where: { id: line.id },
      });
      expect(matched).toMatchObject({
        matchStatus: PaytrMatchStatus.matched,
        paymentId: target.paymentId,
      });

      await matching.accruePspFees();
      const fee = await prisma.ledgerEntry.findMany({
        where: { idempotencyKey: `psp-fee:statement-line:${line.id}` },
      });
      expect(
        Object.fromEntries(
          fee.map((r) => [`${r.account}:${r.direction}`, r.amount.toFixed(2)]),
        ),
      ).toEqual({
        "psp_fee:debit": "30.00",
        "installment_platform_cost:debit": "50.00",
        "buyer_payment:credit": "80.00",
      });
      // A second accrual run books nothing more (stamp + key).
      await matching.accruePspFees();
      expect(
        await prisma.ledgerEntry.count({
          where: { idempotencyKey: `psp-fee:statement-line:${line.id}` },
        }),
      ).toBe(3);

      const report = await ledgerReconciliation.reconcile();
      expect(report.pspFeeLedgerTotal).toBe(report.pspFeeStampedTotal);
      expect(report.driftAlarms.filter((a) => a.includes("PSP_FEE"))).toEqual(
        [],
      );

      // The seller side is the single-payment split: holds 540 / 360.
      const holds = await prisma.paymentHold.findMany({
        where: { paymentId: target.paymentId },
        select: { amount: true },
      });
      expect(holds.map((h) => h.amount.toFixed(2)).sort()).toEqual([
        "360.00",
        "540.00",
      ]);

      // Finance: the cost row moves by P, the S1 identity does not move.
      const summaryAfter = await loadInstallmentSummary(prisma);
      expect(
        D(summaryAfter.totals.platformCostBooked)
          .minus(summaryBefore.totals.platformCostBooked)
          .toFixed(2),
      ).toBe("50.00");
      expect(
        D(summaryAfter.totals.platformCostExpected)
          .minus(summaryBefore.totals.platformCostExpected)
          .toFixed(2),
      ).toBe("50.00");
      const after = await revenueSplit.compute();
      expect(
        D(after.section.total.amount)
          .minus(before.section.total.amount)
          .toFixed(2),
      ).toBe("1000.00");
      expect(after.section.difference).toBe(before.section.difference);
    } finally {
      await prisma.installmentRule.update({
        where: { id: rule.id },
        data: { archivedAt: new Date(), archivedBy: "e2e-a5" },
      });
    }
  });

  it("collects the vade farkı in the S1 identity without moving its difference", async () => {
    const before = await revenueSplit.compute();
    await capturedCart();
    const after = await revenueSplit.compute();

    expect(
      D(after.section.total.amount)
        .minus(before.section.total.amount)
        .toFixed(2),
    ).toBe("1066.38");
    const fee = (r: typeof before) =>
      r.section.components.find((c) => c.key === "installmentFee")?.amount ?? 0;
    expect(D(fee(after)).minus(fee(before)).toFixed(2)).toBe("66.38");
    expect(after.section.difference).toBe(before.section.difference);
  });
});
