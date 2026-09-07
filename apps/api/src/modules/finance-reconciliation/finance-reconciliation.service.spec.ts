import { PaymentStatus, PayoutStatus } from "@prisma/client";
import { FinanceReconciliationService } from "./finance-reconciliation.service";

/**
 * S2 (satıcı hakedişi nerede), S2b (takas karşı taraf), S3 (platform geliri →
 * hak ediş), S3-bilgi (alıcı iadeleri) ve S4 (PayTR karşılaştırması) — her bölüm
 * kendi kimliğini kapatır. Fixture, revenue-split.helper.spec'teki setin devamı:
 *  A released + completed payout net 800 / mahsup 34; B held, refundedAmount 76;
 *  C held 0; D cancelled (refundedAmount 88). Σ hold 1098 = 100 + 0 + 800 + 34 + 164.
 */
const agg = (sum: Record<string, unknown>, count = 0) =>
  Promise.resolve({ _sum: sum, _count: { id: count } });

function makePrisma(overrides: Record<string, any> = {}) {
  const base: Record<string, any> = {
    paymentHold: {
      aggregate: jest.fn().mockImplementation(({ where }: any) => {
        if (!where) return agg({ amount: 1098 }, 4);
        if (where.status === "held")
          return agg({ amount: 176, refundedAmount: 76 }, 2);
        if (where.status === "released")
          return agg({ amount: 0, refundedAmount: 0 }, 0);
        if (where.status?.not === "cancelled")
          return agg({ refundedAmount: 76 });
        if (where.status === "cancelled") return agg({ amount: 88 }, 1);
        return agg({});
      }),
    },
    payoutTransfer: {
      aggregate: jest.fn().mockImplementation(({ where }: any) => {
        if (where.paymentHoldId)
          return agg({ netAmount: 800, adjustmentDeduction: 34 }, 1);
        if (where.tradeCashPayment)
          return agg({ netAmount: 150, adjustmentDeduction: 0 }, 1);
        // S4 payout satırları
        if (where.status === PayoutStatus.completed)
          return agg({ submittedAmount: 800 }, 1);
        if (where.status === PayoutStatus.returned)
          return agg({ submittedAmount: 0 }, 0);
        if (where.status === PayoutStatus.processing)
          return agg({ submittedAmount: 90 }, 1);
        return agg({ submittedAmount: 890 }, 2);
      }),
    },
    tradeCashPayment: {
      // 300 bekliyor (release yok), 150 ödendi (transfer tamam), 50 iade.
      aggregate: jest.fn().mockImplementation(({ where }: any) => {
        if (where.fullRefundEntitled)
          return { _sum: { tradeFeeAmount: 0, commission: 0 } };
        if (where.status === PaymentStatus.refunded) return agg({ amount: 50 });
        if (where.releasedAt === null) return agg({ amount: 300 }, 1);
        if (where.releasedAt?.not === null) return agg({ amount: 0 });
        return agg({ amount: 500 }, 3);
      }),
    },
    commissionLedger: {
      aggregate: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          where.status === "waived"
            ? agg({ sellerCommission: 10, buyerFee: 5 }, 1)
            : agg({ refundedSellerCommission: 10, refundedBuyerFee: 5 }),
        ),
    },
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
    },
    refundFinancialComponent: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { netAmount: 0 } }),
    },
    ledgerEntry: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
    },
    refundAttempt: {
      aggregate: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          where.provider ? agg({ amount: 202 }) : agg({ amount: 202 }, 2),
        ),
    },
    refundRequest: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          refundedProductAmount: 100,
          refundedOutboundShippingAmount: 0,
          refundedBuyerProtectionAmount: 5,
          refundedBuyerServiceTaxAmount: 1,
          returnShippingChargeToBuyer: 0,
        },
        _count: { id: 1 },
      }),
    },
    paytrStatementLine: {
      findFirst: jest.fn().mockResolvedValue({
        transactionDate: new Date("2026-08-01T00:00:00Z"),
      }),
      aggregate: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          where.type === "sale"
            ? agg({ amount: 2597.2, fee: 30 })
            : agg({ amount: 202 }),
        ),
    },
    paytrSettlement: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { netTotal: 2365.2 } }),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 2357.2 } }),
    },
    membershipPayment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 240 } }),
    },
  };
  return { ...base, ...overrides };
}

function makeService(prisma: any, syncEnabled = true) {
  const revenueSplit = {
    compute: jest.fn().mockResolvedValue({
      section: {
        key: "revenueSplit",
        kind: "identity",
        scope: "allTime",
        total: { key: "collected", amount: 2597.2 },
        components: [],
        difference: 0,
        balanced: true,
      },
      diagnostics: {
        paymentsWithoutOrders: 0,
        ordersWithoutHold: 0,
        productTaxTotal: 0,
        commissionLedgerDrift: 0,
      },
      platformFeesNet: 788,
      rates: { serviceVatRate: 20, standardVatRate: 20 },
    }),
  };
  const config = {
    get: jest.fn((k: string) =>
      k === "PAYTR_REPORT_SYNC_ENABLED" && syncEnabled ? "true" : undefined,
    ),
  };
  return new FinanceReconciliationService(
    prisma,
    config as any,
    revenueSplit as any,
  );
}

const section = (r: any, key: string) =>
  r.sections.find((s: any) => s.key === key);
const byKey = (s: any) =>
  Object.fromEntries(s.components.map((c: any) => [c.key, c.amount]));

describe("FinanceReconciliationService.build", () => {
  it("S2: hold total splits into escrow, in transit, paid, deducted and refunded with zero difference", async () => {
    const r = await makeService(makePrisma()).build();
    const s = section(r, "sellerShare");

    expect(s.total.amount).toBe(1098);
    expect(byKey(s)).toEqual({
      escrowHeld: 100,
      inTransit: 0,
      paidNet: 800,
      adjustmentDeducted: 34,
      refundedToBuyer: 164,
    });
    expect(s.difference).toBe(0);
    expect(s.balanced).toBe(true);
    expect(s.scope).toBe("instant");
  });

  it("S2b: trade counterpart cash splits by release/payout/refund state", async () => {
    const r = await makeService(makePrisma()).build();
    const s = section(r, "tradeCounterpart");

    expect(s.total.amount).toBe(500);
    expect(byKey(s)).toEqual({
      awaitingRelease: 300,
      inTransit: 0,
      paidNet: 150,
      adjustmentDeducted: 0,
      refunded: 50,
    });
    expect(s.difference).toBe(0);
  });

  it("S3: platform fees waterfall down to Tarodan net after refunds, waivers and PSP fee", async () => {
    const r = await makeService(makePrisma()).build();
    const s = section(r, "platformNet");

    expect(s.kind).toBe("waterfall");
    expect(s.total.amount).toBe(788);
    expect(byKey(s)).toEqual({
      refundedFees: -15,
      waivedFees: -15,
      tradeFeeReversed: 0,
      virtualRefundsNet: 0,
      platformAbsorbed: 0,
      pspFee: -30,
    });
    expect(s.result).toMatchObject({
      key: "tarodanNet",
      amount: 728,
      syncDependent: true,
    });
  });

  it("S3-info: buyer refunds break down by component with the remainder unclassified", async () => {
    const r = await makeService(makePrisma()).build();
    const s = section(r, "buyerRefunds");

    expect(s.kind).toBe("breakdown");
    expect(s.total.amount).toBe(202);
    expect(byKey(s)).toEqual({
      product: 100,
      outboundShipping: 0,
      buyerFees: 5,
      buyerVat: 1,
      returnShippingCharged: 0,
      unclassified: 96,
    });
  });

  it("S4: compares ours vs PayTR from the first covered statement day and reports awaiting payouts", async () => {
    const prisma = makePrisma();
    const r = await makeService(prisma).build();

    expect(r.comparison.coverageFrom).toBe("2026-08-01");
    // "Bizim" ödeme sorgusu kapsam başlangıcından itibaren (İstanbul gün başı).
    const paymentWhere = prisma.payment.aggregate.mock.calls[0][0].where;
    expect(paymentWhere.paidAt.gte.toISOString()).toBe(
      "2026-07-31T21:00:00.000Z",
    );
    const rows = Object.fromEntries(
      r.comparison.rows.map((x: any) => [x.key, x]),
    );
    expect(rows.sales).toMatchObject({
      ours: 2597.2,
      theirs: 2597.2,
      balanced: true,
    });
    expect(rows.refunds).toMatchObject({
      ours: 202,
      theirs: 202,
      balanced: true,
    });
    expect(rows.pspFee).toMatchObject({ ours: 30, theirs: 30, balanced: true });
    expect(rows.settlementNet).toMatchObject({
      ours: 2365.2,
      theirs: 2365.2,
      balanced: true,
      informational: true,
    });
    // Gerçekleşen + projeksiyon birlikte (valör): isProjection filtresi YOK.
    expect(
      prisma.paytrSettlement.aggregate.mock.calls[0][0].where,
    ).toBeUndefined();
    expect(rows.payouts).toMatchObject({
      ours: 890,
      theirs: 800,
      difference: 90,
      balanced: false,
      count: 1,
    });
  });

  it("flags the PSP comparison and sync-dependent lines when the report sync is off", async () => {
    const r = await makeService(makePrisma(), false).build();

    expect(r.syncEnabled).toBe(false);
    expect(r.comparison.syncEnabled).toBe(false);
    const s = section(r, "platformNet");
    expect(
      s.components.find((c: any) => c.key === "pspFee").syncDependent,
    ).toBe(true);
  });

  it("does not window 'ours' when PayTR has no statement lines yet", async () => {
    const prisma = makePrisma({
      paytrStatementLine: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0, fee: 0 } }),
      },
    });
    const r = await makeService(prisma).build();

    expect(r.comparison.coverageFrom).toBeNull();
    expect(
      prisma.payment.aggregate.mock.calls[0][0].where.paidAt,
    ).toBeUndefined();
  });
});
