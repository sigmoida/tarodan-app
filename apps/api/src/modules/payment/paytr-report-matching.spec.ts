import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { PaytrReportMatchingService } from "./paytr-report-matching.service";

/**
 * Faz 3 — PSP mutabakat fark motoru:
 *  - İleri yön: her döküm satırı Payment/RefundAttempt ile eşleşmeli
 *    (oid + tutar toleransı) → matched / amount_mismatch / unmatched.
 *  - Ters yön: dökümü OLAN günlerde bizde completed görünüp PayTR dökümünde
 *    OLMAYAN ödeme = para gelmemiş olabilir → en kritik alarm. Dökümü olmayan
 *    gün taranmaz (rapor yetkisi yokken her ödeme alarm olmasın).
 *  - Hakediş doğrulaması: sales - returns = net (PayTR iç tutarlılığı) ve
 *    kalem toplamı ↔ satış toplamı.
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
    ...overrides,
  };
}

function makePrisma(opts: {
  lines?: any[];
  dayOids?: string[];
  coveredDays?: Date[];
  payment?: any;
  dayPayments?: any[];
  refundAttempts?: any[];
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
        if (args?.where?.matchStatus) {
          return Promise.resolve(opts.lines ?? []);
        }
        // gün-bazlı satış oid listesi (ters yön taraması)
        return Promise.resolve(
          (opts.dayOids ?? []).map((merchantOid) => ({ merchantOid })),
        );
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(opts.payment ?? null),
      findMany: jest.fn().mockResolvedValue(opts.dayPayments ?? []),
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
        }),
      }),
    );
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

  it("leaves the line unmatched when no payment exists (ekran listeler)", async () => {
    const prisma = makePrisma({ lines: [makeLine()] });
    const service = new PaytrReportMatchingService(prisma as any);

    const r = await service.matchStatementLines();

    expect(r.unmatched).toBe(1);
    expect(prisma.paytrStatementLine.update).not.toHaveBeenCalled();
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

    // Bizde var, PayTR dökümünde yok → para gelmemiş olabilir.
    expect(r.missingInPaytr).toBe(1);
  });

  it("aligns the payment window to the ISTANBUL day and checks oids window-wide", async () => {
    // PayTR günleri İstanbul'dur (UTC+3). 31 Tem 22:00 UTC'de biten ödeme
    // İstanbul'da 1 Ağustos'tur ve dökümde ertesi günün satırında görünür —
    // UTC pencereli, gün-lokal set'li eski mantık bunu sahte
    // PAYTR_MISSING_TRANSACTION alarmına çeviriyordu.
    const prisma = makePrisma({
      lines: [],
      coveredDays: [DAY],
      dayOids: ["ORD-LATE"], // pencere-GLOBAL satış oid seti (ertesi günün satırı dahil)
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
    // Ödeme sorgusu İstanbul gününe hizalı olmalı: [00:00-3s, 24:00-3s) UTC.
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
});
