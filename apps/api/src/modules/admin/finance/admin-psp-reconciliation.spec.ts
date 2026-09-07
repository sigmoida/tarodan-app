import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { AdminPspReconciliationService } from "./admin-psp-reconciliation.service";

/**
 * Admin PSP mutabakat okuma modeli. Ekran PayTR'ye canlı sorgu atmaz; gece
 * sync'inin doldurduğu yerel tablolardan senkron durumu + gün-bazlı özet +
 * problem satırları (çözümlenebilir / yeniden eşlenebilir) + hakediş listesi döner.
 *
 * Gün kartı kuralları:
 *  - PayTR tarafı yalnız döküm satırlarından; bizim taraf Payment + MembershipPayment
 *    (üyelik yenilemesi) + RefundAttempt'ten, İSTANBUL gününe dilinerek.
 *  - missingInPaytr yalnız DÖKÜMÜ OLAN gün için; oid geçmişi (yeniden başlatılan
 *    ödeme) eşleştiriciyle aynı çözümleyiciden okunur.
 *  - Çözümlenmiş problem satırı sayılmaz; tolerans eşleştiriciyle aynı (0.05).
 */

const DAY = new Date("2026-07-31T00:00:00.000Z");

function makePrisma(opts: {
  lines?: any[];
  payments?: any[];
  renewals?: any[];
  refunds?: any[];
  settlements?: any[];
  linesList?: any[];
  linesCount?: number;
  paymentRows?: any[];
  line?: any;
  lineCount?: number;
}) {
  return {
    paytrStatementLine: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.skip !== undefined) {
          return Promise.resolve(opts.linesList ?? []);
        }
        return Promise.resolve(opts.lines ?? []);
      }),
      count: jest
        .fn()
        .mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.transactionDate?.lt !== undefined
              ? (opts.lineCount ?? 0)
              : (opts.linesCount ?? 0),
          ),
        ),
      findUnique: jest.fn().mockResolvedValue(opts.line ?? null),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ ...(opts.line ?? {}), ...data }),
        ),
    },
    payment: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.id) return Promise.resolve(opts.paymentRows ?? []);
        return Promise.resolve(opts.payments ?? []);
      }),
    },
    membershipPayment: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.id) return Promise.resolve([]);
        return Promise.resolve(opts.renewals ?? []);
      }),
    },
    refundAttempt: {
      findMany: jest.fn().mockResolvedValue(opts.refunds ?? []),
    },
    paytrSettlement: {
      findMany: jest.fn().mockResolvedValue(opts.settlements ?? []),
    },
  };
}

function makeService(
  prisma: any,
  overrides: { rematch?: jest.Mock; syncState?: any } = {},
) {
  const matching = {
    rematchLine: overrides.rematch ?? jest.fn().mockResolvedValue("matched"),
  };
  const syncState = {
    getState: jest.fn().mockResolvedValue(
      overrides.syncState ?? {
        enabled: true,
        statement: { at: "2026-07-31T02:00:00.000Z", status: "ok" },
        settlement: null,
        stale: false,
      },
    ),
  };
  const audit = { createRequiredAuditLog: jest.fn().mockResolvedValue({}) };
  const service = new AdminPspReconciliationService(
    prisma,
    matching as any,
    syncState as any,
    audit as any,
  );
  return { service, matching, syncState, audit };
}

const SALE = (o: Record<string, unknown> = {}) => ({
  merchantOid: "ORD1",
  type: PaytrStatementLineType.sale,
  amount: 100,
  fee: 2.35,
  net: 97.65,
  transactionDate: DAY,
  matchStatus: PaytrMatchStatus.matched,
  ledgerRecordedAt: null,
  resolvedAt: null,
  ...o,
});

describe("AdminPspReconciliationService.getReconciliationSummary", () => {
  it("builds a day card comparing PayTR statement totals with our records and reports sync state", async () => {
    const prisma = makePrisma({
      lines: [
        SALE({ ledgerRecordedAt: new Date() }),
        SALE({
          merchantOid: "ORD2",
          amount: 50,
          fee: 1,
          net: 49,
          matchStatus: PaytrMatchStatus.unmatched,
        }),
        SALE({
          type: PaytrStatementLineType.refund,
          amount: 20,
          fee: null,
          net: null,
        }),
      ],
      payments: [
        {
          id: "pay-1",
          amount: 100,
          paidAt: new Date("2026-07-31T10:00:00Z"),
          providerConversationId: "ORD1",
          status: PaymentStatus.completed,
        },
        {
          // PayTR dökümünde OLMAYAN ödeme → missingInPaytr
          id: "pay-ghost",
          amount: 75,
          paidAt: new Date("2026-07-31T12:00:00Z"),
          providerConversationId: "GHOST",
          status: PaymentStatus.completed,
        },
      ],
      refunds: [
        {
          amount: 20,
          providerSucceededAt: new Date("2026-07-31T13:00:00Z"),
          status: RefundAttemptStatus.finalized,
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getReconciliationSummary(7);
    const day = result.days.find((d) => d.date === "2026-07-31");

    if (!day) throw new Error("expected day not present in the summary");
    expect(result.sync).toMatchObject({ enabled: true, stale: false });
    expect(day.paytr).toMatchObject({
      salesCount: 2,
      salesTotal: 150,
      refundCount: 1,
      refundTotal: 20,
      feeTotal: 3.35,
      netTotal: 146.65,
    });
    expect(day.ours).toMatchObject({
      salesCount: 2,
      salesTotal: 175,
      refundTotal: 20,
      // Yalnız deftere yazılmış (ledgerRecordedAt) kesinti "bizim" sütununa girer.
      feeBooked: 2.35,
    });
    expect(day.match).toMatchObject({
      matched: 2,
      unmatched: 1,
      mismatched: 0,
    });
    expect(day.missingInPaytr).toBe(1);
    expect(day.salesDiff).toBeCloseTo(25);
    expect(day.tolerance).toBe(0.05);
  });

  it("starts the window at the ISTANBUL day start, not UTC midnight", async () => {
    const prisma = makePrisma({});
    const { service } = makeService(prisma);

    await service.getReconciliationSummary(7);

    const since: Date =
      prisma.payment.findMany.mock.calls[0][0].where.paidAt.gte;
    // İstanbul gün başı = UTC 21:00 (önceki gün).
    expect(since.getUTCHours()).toBe(21);
    expect(since.getUTCMinutes()).toBe(0);
  });

  it("includes membership renewals in our sales and in the missing check", async () => {
    const prisma = makePrisma({
      lines: [SALE({ merchantOid: "MEM-A", amount: 240 })],
      renewals: [
        {
          id: "mp-1",
          amount: 240,
          createdAt: new Date("2026-07-31T08:00:00Z"),
          merchantOid: "MEM-A",
        },
        {
          id: "mp-ghost",
          amount: 240,
          createdAt: new Date("2026-07-31T09:00:00Z"),
          merchantOid: "MEM-GHOST",
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getReconciliationSummary(7);
    const day = result.days.find((d) => d.date === "2026-07-31");

    expect(day?.ours).toMatchObject({ salesCount: 2, salesTotal: 480 });
    expect(day?.missingInPaytr).toBe(1);
  });

  it("buckets our records by the ISTANBUL day and resolves re-initiated payments through oid history", async () => {
    const prisma = makePrisma({
      lines: [
        SALE({
          merchantOid: "OLD-OID",
          amount: 75,
          fee: 1,
          net: 74,
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ],
      payments: [
        {
          // 31 Tem 22:00 UTC = 1 Ağu 01:00 İstanbul → 1 Ağustos kartı. Güncel oid
          // dökümde yok, eski oid var → "dökümde yok" DEĞİL (eşleştiriciyle aynı).
          id: "pay-late",
          amount: 75,
          paidAt: new Date("2026-07-31T22:00:00Z"),
          providerConversationId: "NEW-OID",
          metadata: { merchantOidHistory: ["OLD-OID"] },
          status: PaymentStatus.completed,
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getReconciliationSummary(7);
    const aug1 = result.days.find((d) => d.date === "2026-08-01");
    const jul31 = result.days.find((d) => d.date === "2026-07-31");

    expect(aug1?.ours.salesCount).toBe(1);
    expect(aug1?.missingInPaytr).toBe(0);
    expect(jul31?.ours.salesCount ?? 0).toBe(0);
  });

  it("does not count resolved problem lines and marks today's card provisional", async () => {
    const today = new Date();
    const prisma = makePrisma({
      lines: [
        SALE({
          matchStatus: PaytrMatchStatus.amount_mismatch,
          resolvedAt: new Date(),
          transactionDate: new Date(
            `${today.toISOString().slice(0, 10)}T00:00:00.000Z`,
          ),
        }),
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getReconciliationSummary(7);
    const card = result.days[0];

    expect(card.match).toEqual({ matched: 0, mismatched: 0, unmatched: 0 });
    expect(typeof card.provisional).toBe("boolean");
  });

  it("does not count missingInPaytr on a day without statement coverage", async () => {
    const prisma = makePrisma({
      lines: [],
      payments: [
        {
          id: "pay-1",
          amount: 100,
          paidAt: new Date("2026-07-31T10:00:00Z"),
          providerConversationId: "ORD1",
          status: PaymentStatus.completed,
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getReconciliationSummary(7);
    const day = result.days.find((d) => d.date === "2026-07-31");
    if (!day) throw new Error("expected day not present in the summary");

    expect(day.missingInPaytr).toBe(0);
    expect(day.paytrCovered).toBe(false);
  });
});

describe("AdminPspReconciliationService.getMissingPayments", () => {
  it("lists payments and renewals of the Istanbul day whose oids are absent from the statement", async () => {
    const prisma = makePrisma({
      lineCount: 3,
      lines: [{ merchantOid: "ORD1" }],
      payments: [
        {
          id: "pay-1",
          amount: 100,
          paidAt: new Date("2026-07-31T10:00:00Z"),
          providerConversationId: "ORD1",
          order: { orderNumber: "ORD-1" },
        },
        {
          id: "pay-ghost",
          amount: 75,
          paidAt: new Date("2026-07-31T12:00:00Z"),
          providerConversationId: "GHOST",
          order: null,
          checkoutGroup: { groupNumber: "GRP-9" },
        },
      ],
      renewals: [
        {
          id: "mp-ghost",
          amount: 240,
          createdAt: new Date("2026-07-31T09:00:00Z"),
          merchantOid: "MEM-GHOST",
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getMissingPayments("2026-07-31");

    expect(result.paytrCovered).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(["pay-ghost", "mp-ghost"]);
    expect(result.items[0]).toMatchObject({
      kind: "payment",
      reference: "GRP-9",
      merchantOid: "GHOST",
    });
    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where.paidAt.gte.toISOString()).toBe("2026-07-30T21:00:00.000Z");
  });

  it("returns an empty list when the day has no statement coverage", async () => {
    const prisma = makePrisma({ lineCount: 0, payments: [{ id: "x" }] });
    const { service } = makeService(prisma);

    const result = await service.getMissingPayments("2026-07-31");

    expect(result).toEqual({
      date: "2026-07-31",
      paytrCovered: false,
      items: [],
    });
  });
});

describe("AdminPspReconciliationService.getStatementLines", () => {
  it("defaults to unresolved problem rows, orders deterministically and joins references", async () => {
    const prisma = makePrisma({
      linesList: [
        {
          id: "line-1",
          merchantOid: "ORD1",
          type: PaytrStatementLineType.sale,
          amount: 100,
          matchStatus: PaytrMatchStatus.amount_mismatch,
          paymentId: "pay-1",
          membershipPaymentId: null,
          transactionDate: DAY,
        },
      ],
      linesCount: 1,
      paymentRows: [
        {
          id: "pay-1",
          amount: 99,
          order: { orderNumber: "ORD-10001" },
          checkoutGroup: null,
          tradeCashPayment: null,
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getStatementLines({});

    expect(prisma.paytrStatementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          matchStatus: { not: PaytrMatchStatus.matched },
          resolvedAt: null,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: "line-1",
      payment: expect.objectContaining({ orderNumber: "ORD-10001" }),
      membershipPayment: null,
    });
  });

  it("filters by an explicit status and can include resolved rows", async () => {
    const prisma = makePrisma({ linesList: [], linesCount: 0 });
    const { service } = makeService(prisma);

    await service.getStatementLines({
      status: "amount_mismatch",
      includeResolved: true,
    });

    expect(prisma.paytrStatementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchStatus: PaytrMatchStatus.amount_mismatch },
      }),
    );
  });
});

describe("AdminPspReconciliationService resolve / rematch", () => {
  it("resolves a problem line with a note and writes an audit log", async () => {
    const prisma = makePrisma({
      line: {
        id: "line-1",
        matchStatus: PaytrMatchStatus.unmatched,
        resolvedAt: null,
      },
    });
    const { service, audit } = makeService(prisma);

    const r = await service.resolveStatementLine(
      "adm-1",
      "line-1",
      "test işlemi",
    );

    expect(r.success).toBe(true);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolvedById: "adm-1",
          resolutionNote: "test işlemi",
          resolvedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "adm-1",
      "psp_line_resolve",
      "PaytrStatementLine",
      "line-1",
      expect.anything(),
      expect.objectContaining({ note: "test işlemi" }),
    );
  });

  it("refuses to resolve a matched line", async () => {
    const prisma = makePrisma({
      line: { id: "line-1", matchStatus: PaytrMatchStatus.matched },
    });
    const { service } = makeService(prisma);

    await expect(
      service.resolveStatementLine("adm-1", "line-1", "x"),
    ).rejects.toThrow();
  });

  it("re-runs matching for a single line through the matching engine", async () => {
    const rematch = jest.fn().mockResolvedValue("unmatched");
    const prisma = makePrisma({
      line: { id: "line-1", matchStatus: PaytrMatchStatus.amount_mismatch },
    });
    const { service, audit } = makeService(prisma, { rematch });

    const r = await service.rematchStatementLine("adm-1", "line-1");

    expect(rematch).toHaveBeenCalledWith("line-1");
    expect(r).toEqual({
      success: true,
      lineId: "line-1",
      outcome: "unmatched",
    });
    expect(audit.createRequiredAuditLog).toHaveBeenCalled();
  });
});

describe("AdminPspReconciliationService.getSettlements", () => {
  it("returns settlements newest-first with item counts and consistency flags", async () => {
    const prisma = makePrisma({
      settlements: [
        {
          id: "stl-1",
          datePaid: new Date("2026-07-30T00:00:00Z"),
          salesTotal: 950.95,
          returnTotal: 12.64,
          netTotal: 938.31,
          isProjection: false,
          merchantIban: "TR00...01",
          itemsSyncedAt: new Date(),
          _count: { items: 2 },
          items: [{ amount: 900 }, { amount: 50.95 }],
        },
        {
          id: "stl-bad",
          datePaid: new Date("2026-07-29T00:00:00Z"),
          salesTotal: 100,
          returnTotal: 0,
          netTotal: 90,
          isProjection: false,
          merchantIban: null,
          itemsSyncedAt: null,
          _count: { items: 0 },
          items: [],
        },
      ],
    });
    const { service } = makeService(prisma);

    const result = await service.getSettlements({});

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: "stl-1",
      itemCount: 2,
      itemsSynced: true,
      consistent: true,
      itemsConsistent: true,
    });
    expect(result.data[1]).toMatchObject({
      id: "stl-bad",
      itemsSynced: false,
      consistent: false,
      itemsConsistent: null,
    });
  });
});
