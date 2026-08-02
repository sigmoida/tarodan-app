import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { AdminPspReconciliationService } from "./admin-psp-reconciliation.service";

/**
 * Admin PSP mutabakat okuma modeli (Faz 4). Ekran PayTR'ye canlı sorgu atmaz;
 * gece sync'inin doldurduğu yerel tablolardan gün-bazlı özet + problem satırları
 * + hakediş listesi döner.
 *
 * Gün kartı kuralları:
 *  - PayTR tarafı yalnız döküm satırlarından; bizim taraf Payment/RefundAttempt'ten.
 *  - missingInPaytr yalnız DÖKÜMÜ OLAN gün için hesaplanır (rapor yetkisi yokken
 *    her ödeme "eksik" görünmesin).
 */

const DAY = new Date("2026-07-31T00:00:00.000Z");

function makePrisma(opts: {
  lines?: any[];
  payments?: any[];
  refunds?: any[];
  settlements?: any[];
  linesList?: any[];
  linesCount?: number;
  paymentRows?: any[];
}) {
  return {
    paytrStatementLine: {
      findMany: jest.fn().mockImplementation((args: any) => {
        // liste ucu: sayfalama (skip/take) ile çağrılır; özet ucu tarih filtresiyle.
        if (args?.skip !== undefined) {
          return Promise.resolve(opts.linesList ?? []);
        }
        return Promise.resolve(opts.lines ?? []);
      }),
      count: jest.fn().mockResolvedValue(opts.linesCount ?? 0),
    },
    payment: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.id) return Promise.resolve(opts.paymentRows ?? []);
        return Promise.resolve(opts.payments ?? []);
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

describe("AdminPspReconciliationService.getReconciliationSummary", () => {
  it("builds a day card comparing PayTR statement totals with our records", async () => {
    const prisma = makePrisma({
      lines: [
        {
          merchantOid: "ORD1",
          type: PaytrStatementLineType.sale,
          amount: 100,
          fee: 2.35,
          net: 97.65,
          transactionDate: DAY,
          matchStatus: PaytrMatchStatus.matched,
        },
        {
          merchantOid: "ORD2",
          type: PaytrStatementLineType.sale,
          amount: 50,
          fee: 1,
          net: 49,
          transactionDate: DAY,
          matchStatus: PaytrMatchStatus.unmatched,
        },
        {
          merchantOid: "ORD1",
          type: PaytrStatementLineType.refund,
          amount: 20,
          fee: null,
          net: null,
          transactionDate: DAY,
          matchStatus: PaytrMatchStatus.matched,
        },
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
    const service = new AdminPspReconciliationService(prisma as any);

    const result = await service.getReconciliationSummary(7);
    const day = result.days.find((d: any) => d.date === "2026-07-31");

    expect(day).toBeDefined();
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
    });
    expect(day.match).toMatchObject({
      matched: 2,
      unmatched: 1,
      mismatched: 0,
    });
    expect(day.missingInPaytr).toBe(1);
    // Fark = bizim satış - PayTR satış (kartta kırmızı gösterilecek değer).
    expect(day.salesDiff).toBeCloseTo(25);
  });

  it("buckets our records by the ISTANBUL day and matches oids window-wide", async () => {
    // 31 Tem 22:00 UTC = 1 Ağu 01:00 İstanbul → ödeme 1 Ağustos kartına düşmeli
    // ve oid'i pencere genelinde arandığı için "dökümde yok" sayılmamalı.
    const prisma = makePrisma({
      lines: [
        {
          merchantOid: "ORD-LATE",
          type: PaytrStatementLineType.sale,
          amount: 75,
          fee: 1,
          net: 74,
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          matchStatus: PaytrMatchStatus.matched,
        },
      ],
      payments: [
        {
          id: "pay-late",
          amount: 75,
          paidAt: new Date("2026-07-31T22:00:00Z"),
          providerConversationId: "ORD-LATE",
          status: PaymentStatus.completed,
        },
      ],
    });
    const service = new AdminPspReconciliationService(prisma as any);

    const result = await service.getReconciliationSummary(7);
    const aug1 = result.days.find((d: any) => d.date === "2026-08-01");
    const jul31 = result.days.find((d: any) => d.date === "2026-07-31");

    expect(aug1?.ours.salesCount).toBe(1);
    expect(aug1?.missingInPaytr).toBe(0);
    expect(jul31?.ours.salesCount ?? 0).toBe(0);
  });

  it("does not count missingInPaytr on a day without statement coverage", async () => {
    const prisma = makePrisma({
      lines: [], // hiç döküm yok
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
    const service = new AdminPspReconciliationService(prisma as any);

    const result = await service.getReconciliationSummary(7);
    const day = result.days.find((d: any) => d.date === "2026-07-31");

    expect(day.missingInPaytr).toBe(0);
    expect(day.paytrCovered).toBe(false);
  });
});

describe("AdminPspReconciliationService.getStatementLines", () => {
  it("defaults to problem rows (matched hariç) and joins payment references", async () => {
    const prisma = makePrisma({
      linesList: [
        {
          id: "line-1",
          merchantOid: "ORD1",
          type: PaytrStatementLineType.sale,
          amount: 100,
          matchStatus: PaytrMatchStatus.amount_mismatch,
          paymentId: "pay-1",
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
        },
      ],
    });
    const service = new AdminPspReconciliationService(prisma as any);

    const result = await service.getStatementLines({});

    expect(prisma.paytrStatementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchStatus: { not: PaytrMatchStatus.matched } },
      }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: "line-1",
      payment: expect.objectContaining({ orderNumber: "ORD-10001" }),
    });
  });

  it("filters by an explicit status", async () => {
    const prisma = makePrisma({ linesList: [], linesCount: 0 });
    const service = new AdminPspReconciliationService(prisma as any);

    await service.getStatementLines({ status: "matched" });

    expect(prisma.paytrStatementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchStatus: PaytrMatchStatus.matched },
      }),
    );
  });
});

describe("AdminPspReconciliationService.getSettlements", () => {
  it("returns settlements newest-first with item counts", async () => {
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
          _count: { items: 12 },
        },
      ],
    });
    const service = new AdminPspReconciliationService(prisma as any);

    const result = await service.getSettlements();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "stl-1",
      itemCount: 12,
      isProjection: false,
    });
  });
});
