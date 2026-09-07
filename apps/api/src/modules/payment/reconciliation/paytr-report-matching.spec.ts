import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { PaytrReportMatchingService } from "./paytr-report-matching.service";

/**
 * Faz 3 — PSP mutabakat fark motoru:
 *  - İleri yön: her döküm satırı Payment / RefundAttempt / MembershipPayment ile
 *    eşleşmeli (oid + tutar toleransı) → matched / amount_mismatch / unmatched.
 *  - Tıkanma koruması: her deneme `lastMatchAttemptAt` ile damgalanır; seçim yeni
 *    (damgasız) satırları öne alır, kalıcı karşılıksızları günde bir dener.
 *  - Tüketilmiş karşılık: aynı Payment/RefundAttempt'e ikinci satır bağlanamaz
 *    (çift tahsilat görünür kalır).
 *  - Ters yön: dökümü OLAN günlerde bizde completed görünüp PayTR dökümünde
 *    OLMAYAN ödeme (sipariş + üyelik) = para gelmemiş olabilir → en kritik alarm.
 *  - Hakediş doğrulaması: sales - returns = net ve kalem toplamı ↔ satış toplamı.
 */

const DAY = new Date("2026-07-31T00:00:00Z");

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    merchantOid: "ORD1",
    type: PaytrStatementLineType.sale,
    amount: 100,
    transactionDate: DAY,
    matchStatus: PaytrMatchStatus.unmatched,
    paymentId: null,
    refundAttemptId: null,
    membershipPaymentId: null,
    lastMatchAttemptAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

function makePrisma(opts: {
  lines?: any[];
  dayOids?: string[];
  coveredDays?: Date[];
  payment?: any;
  dayPayments?: any[];
  dayRenewals?: any[];
  refundAttempts?: any[];
  consumedLines?: any[];
  alreadyLinkedLine?: any;
  membership?: any;
  refundedMembership?: any;
  settlements?: any[];
  items?: any[];
}) {
  return {
    paytrStatementLine: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.distinct) {
          return Promise.resolve(
            (opts.coveredDays ?? []).map((d) => ({ transactionDate: d })),
          );
        }
        // Tüketilmiş iade denemeleri (refundAttemptId not null).
        if (args?.where?.refundAttemptId) {
          return Promise.resolve(opts.consumedLines ?? []);
        }
        // Eşleştirme seçimi: unmatched + damga koşulu (OR).
        if (args?.where?.OR) {
          return Promise.resolve(opts.lines ?? []);
        }
        // pencere-global satış oid listesi (ters yön taraması)
        return Promise.resolve(
          (opts.dayOids ?? []).map((merchantOid) => ({ merchantOid })),
        );
      }),
      // Çift bağlama koruması: aynı karşılığa bağlı başka satır var mı?
      findFirst: jest.fn().mockResolvedValue(opts.alreadyLinkedLine ?? null),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            (opts.lines ?? []).find((l) => l.id === where.id) ?? makeLine(),
          ),
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(opts.payment ?? null),
      findMany: jest.fn().mockResolvedValue(opts.dayPayments ?? []),
    },
    membershipPayment: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.status === PaymentStatus.refunded
              ? (opts.refundedMembership ?? null)
              : (opts.membership ?? null),
          ),
        ),
      findMany: jest.fn().mockResolvedValue(opts.dayRenewals ?? []),
    },
    refundAttempt: {
      findMany: jest.fn().mockResolvedValue(opts.refundAttempts ?? []),
    },
    paytrSettlement: {
      findMany: jest.fn().mockResolvedValue(opts.settlements ?? []),
    },
    paytrSettlementItem: {
      findMany: jest.fn().mockResolvedValue(opts.items ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const updateData = (prisma: any, lineId: string) =>
  prisma.paytrStatementLine.update.mock.calls
    .filter((c: any) => c[0].where.id === lineId)
    .map((c: any) => c[0].data);

describe("PaytrReportMatchingService.matchStatementLines", () => {
  it("matches a sale line to the payment by oid when the amount agrees", async () => {
    const prisma = makePrisma({
      lines: [makeLine()],
      payment: { id: "pay-1", amount: 100, providerConversationId: "ORD1" },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.matched).toBe(1);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-1" },
        data: expect.objectContaining({
          matchStatus: PaytrMatchStatus.matched,
          paymentId: "pay-1",
          lastMatchAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it("selects only unmatched, unresolved lines not attempted in the last day, newest-first", async () => {
    const prisma = makePrisma({ lines: [] });
    const service = new PaytrReportMatchingService(prisma as any);

    await service.matchStatementLines();

    const args = prisma.paytrStatementLine.findMany.mock.calls.find(
      (c: any) => c[0]?.where?.OR,
    )?.[0];
    expect(args.where).toMatchObject({
      matchStatus: PaytrMatchStatus.unmatched,
      resolvedAt: null,
    });
    expect(args.where.OR).toEqual([
      { lastMatchAttemptAt: null },
      { lastMatchAttemptAt: { lt: expect.any(Date) } },
    ]);
    // Damgasız (yeni) satırlar önce: kalıcı backlog yenileri tıkayamaz.
    expect(args.orderBy[0]).toEqual({
      lastMatchAttemptAt: { sort: "asc", nulls: "first" },
    });
  });

  it("flags amount_mismatch when the payment amount differs", async () => {
    const prisma = makePrisma({
      lines: [makeLine()],
      payment: { id: "pay-1", amount: 99, providerConversationId: "ORD1" },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.mismatched).toBe(1);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchStatus: PaytrMatchStatus.amount_mismatch,
          paymentId: "pay-1",
        }),
      }),
    );
  });

  it("stamps the attempt and leaves the line unmatched when no counterpart exists", async () => {
    const prisma = makePrisma({ lines: [makeLine()] });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.unmatched).toBe(1);
    expect(updateData(prisma, "line-1")).toEqual([
      { lastMatchAttemptAt: expect.any(Date) },
    ]);
  });

  it("matches a sale line to a membership renewal when no Payment carries the oid", async () => {
    const prisma = makePrisma({
      lines: [makeLine({ merchantOid: "MEMOID1", amount: 240 })],
      membership: { id: "mp-1", amount: 240 },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.matched).toBe(1);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchStatus: PaytrMatchStatus.matched,
          membershipPaymentId: "mp-1",
        }),
      }),
    );
  });

  it("refuses to link a second sale line to an already-linked payment (duplicate capture stays visible)", async () => {
    const prisma = makePrisma({
      lines: [makeLine({ id: "line-dup" })],
      payment: { id: "pay-1", amount: 100, providerConversationId: "ORD1" },
      alreadyLinkedLine: { id: "line-1" },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.unmatched).toBe(1);
    expect(updateData(prisma, "line-dup")).toEqual([
      { lastMatchAttemptAt: expect.any(Date) },
    ]);
  });

  it("matches a refund line to a succeeded RefundAttempt via providerReference + amount", async () => {
    const prisma = makePrisma({
      lines: [
        makeLine({
          id: "line-2",
          type: PaytrStatementLineType.refund,
          amount: 50,
        }),
      ],
      refundAttempts: [
        {
          id: "att-1",
          paymentId: "pay-1",
          amount: 50,
          status: RefundAttemptStatus.finalized,
        },
      ],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.matched).toBe(1);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-2" },
        data: expect.objectContaining({
          matchStatus: PaytrMatchStatus.matched,
          refundAttemptId: "att-1",
          paymentId: "pay-1",
        }),
      }),
    );
  });

  it("excludes refund attempts already consumed by another statement line", async () => {
    const prisma = makePrisma({
      lines: [
        makeLine({
          id: "line-3",
          type: PaytrStatementLineType.refund,
          amount: 50,
        }),
      ],
      consumedLines: [{ refundAttemptId: "att-1" }],
      refundAttempts: [],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    await service.matchStatementLines();

    expect(prisma.refundAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ["att-1"] } }),
      }),
    );
  });

  it("matches a refund line to a refunded membership payment", async () => {
    const prisma = makePrisma({
      lines: [
        makeLine({
          id: "line-4",
          type: PaytrStatementLineType.refund,
          merchantOid: "MEMOID1",
          amount: 240,
        }),
      ],
      refundedMembership: { id: "mp-1", amount: 240 },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.matched).toBe(1);
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-4" },
        data: expect.objectContaining({
          matchStatus: PaytrMatchStatus.matched,
          membershipPaymentId: "mp-1",
        }),
      }),
    );
  });

  it("alarms for a completed payment missing from a covered statement day", async () => {
    const prisma = makePrisma({
      lines: [],
      coveredDays: [DAY],
      dayOids: ["ORD1"],
      dayPayments: [
        {
          id: "pay-ghost",
          providerConversationId: "GHOST",
          amount: 75,
          status: PaymentStatus.completed,
        },
      ],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.missingInPaytr).toBe(1);
  });

  it("counts a membership renewal missing from the statement and honours oid history", async () => {
    const prisma = makePrisma({
      lines: [],
      coveredDays: [DAY],
      dayOids: ["OLD-OID"],
      dayPayments: [
        {
          // Yeniden başlatılmış ödeme: güncel oid dökümde yok ama eski oid var.
          id: "pay-reinit",
          providerConversationId: "NEW-OID",
          metadata: { merchantOidHistory: ["OLD-OID"] },
          amount: 75,
        },
      ],
      dayRenewals: [{ id: "mp-ghost", merchantOid: "MEM-GHOST", amount: 240 }],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.missingInPaytr).toBe(1);
  });

  it("aligns the payment window to the ISTANBUL day and checks oids window-wide", async () => {
    const prisma = makePrisma({
      lines: [],
      coveredDays: [DAY],
      dayOids: ["ORD-LATE"],
      dayPayments: [
        {
          id: "pay-late",
          providerConversationId: "ORD-LATE",
          amount: 75,
          status: PaymentStatus.completed,
        },
      ],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.missingInPaytr).toBe(0);
    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where.paidAt.gte.toISOString()).toBe("2026-07-30T21:00:00.000Z");
    expect(where.paidAt.lt.toISOString()).toBe("2026-07-31T21:00:00.000Z");
  });

  it("skips the reverse sweep entirely when no day has statement coverage", async () => {
    const prisma = makePrisma({ lines: [], coveredDays: [] });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(r.missingInPaytr).toBe(0);
  });
});

describe("PaytrReportMatchingService.rematchLine", () => {
  it("resets links/resolution and re-runs matching for a single line", async () => {
    const line = makeLine({
      id: "line-9",
      matchStatus: PaytrMatchStatus.amount_mismatch,
      paymentId: "pay-old",
      resolvedAt: new Date(),
    });
    const prisma = makePrisma({
      lines: [line],
      payment: { id: "pay-1", amount: 100, providerConversationId: "ORD1" },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const outcome = await service.rematchLine("line-9");

    expect(outcome).toBe("matched");
    expect(updateData(prisma, "line-9")[0]).toMatchObject({
      matchStatus: PaytrMatchStatus.unmatched,
      paymentId: null,
      refundAttemptId: null,
      membershipPaymentId: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    expect(updateData(prisma, "line-9")[1]).toMatchObject({
      matchStatus: PaytrMatchStatus.matched,
      paymentId: "pay-1",
    });
  });
});

describe("PaytrReportMatchingService.verifySettlements", () => {
  const SETTLEMENT = {
    id: "stl-1",
    datePaid: new Date("2026-07-30T00:00:00Z"),
    salesTotal: 950.95,
    returnTotal: 12.64,
    netTotal: 938.31,
    isProjection: false,
  };

  it("reports zero mismatches for an internally consistent settlement", async () => {
    const prisma = makePrisma({
      settlements: [SETTLEMENT],
      items: [
        { id: "i1", merchantOid: "OID1", amount: 900, paymentId: "pay-1" },
        { id: "i2", merchantOid: "OID2", amount: 50.95, paymentId: "pay-2" },
      ],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.verifySettlements();

    expect(r).toMatchObject({ checked: 1, mismatches: 0 });
  });

  it("flags a settlement whose net does not equal sales - returns", async () => {
    const prisma = makePrisma({
      settlements: [{ ...SETTLEMENT, netTotal: 900 }],
      items: [],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.verifySettlements();

    expect(r.mismatches).toBe(1);
  });

  it("flags a settlement whose item sum drifts from the sales total", async () => {
    const prisma = makePrisma({
      settlements: [SETTLEMENT],
      items: [{ id: "i1", merchantOid: "OID1", amount: 100, paymentId: null }],
    });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.verifySettlements();

    expect(r.mismatches).toBe(1);
  });

  it("fills missing item paymentIds via oid lookup", async () => {
    const prisma = makePrisma({
      settlements: [SETTLEMENT],
      items: [
        { id: "i1", merchantOid: "OID1", amount: 950.95, paymentId: null },
      ],
      payment: { id: "pay-9", amount: 950.95, providerConversationId: "OID1" },
    });
    const service = new PaytrReportMatchingService(prisma as any);

    await service.verifySettlements();

    expect(prisma.paytrSettlementItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "i1" },
        data: { paymentId: "pay-9" },
      }),
    );
  });

  it("exposes the consistency check for the admin screen", () => {
    expect(
      PaytrReportMatchingService.settlementConsistency({
        ...SETTLEMENT,
        itemSum: 950.95,
      }),
    ).toEqual({ consistent: true, itemsConsistent: true });
    expect(
      PaytrReportMatchingService.settlementConsistency({
        ...SETTLEMENT,
        netTotal: 1,
        itemSum: null,
      }),
    ).toEqual({ consistent: false, itemsConsistent: null });
  });
});
