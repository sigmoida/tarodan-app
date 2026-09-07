import { AdminFinanceService } from "./admin-finance.service";

/**
 * Finans özeti: sağlamalı bölümler FinanceReconciliationService'ten gelir; bu
 * servis yalnız sağlık şeridini (başarısız/dönen transfer, süresi geçmiş hold,
 * faturasız teslimat, tükenmiş eLogo denemesi, açık satıcı borcu) ekler. Bu
 * sayılar zaten üretiliyordu ama yalnız log'a gidiyordu — admin yüzeyine iner.
 */
describe("AdminFinanceService.getFinanceOverview", () => {
  const reconciliation = {
    syncEnabled: true,
    sections: [
      {
        key: "revenueSplit",
        kind: "identity",
        scope: "allTime",
        total: { key: "collected", amount: 2597.2, count: 7 },
        components: [],
        difference: 0,
        balanced: true,
      },
    ],
    comparison: { key: "psp", syncEnabled: true, coverageFrom: null, rows: [] },
    diagnostics: {
      paymentsWithoutOrders: 0,
      ordersWithoutHold: 0,
      productTaxTotal: 0,
      commissionLedgerDrift: 0,
    },
  };

  const makeService = () => {
    const prisma = {
      paymentHold: { count: jest.fn().mockResolvedValue(2) }, // süresi geçmiş held
      payoutTransfer: { count: jest.fn().mockResolvedValue(3) }, // failed/returned
      order: { count: jest.fn().mockResolvedValue(4) }, // faturasız teslimat
      elogoInvoice: { count: jest.fn().mockResolvedValue(1) }, // tükenen
      sellerAccountAdjustment: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { remainingAmount: 340 },
          _count: { id: 5 },
        }),
      },
    };
    const build = jest.fn().mockResolvedValue(reconciliation);
    return {
      service: new AdminFinanceService(prisma as any, { build } as any),
      prisma,
      build,
    };
  };

  it("returns the reconciliation sections alongside the health strip", async () => {
    const { service, build } = makeService();

    const result = await service.getFinanceOverview();

    expect(build).toHaveBeenCalledTimes(1);
    expect(result.syncEnabled).toBe(true);
    expect(result.sections).toBe(reconciliation.sections);
    expect(result.comparison).toBe(reconciliation.comparison);
    expect(result.diagnostics).toBe(reconciliation.diagnostics);
    expect(result).not.toHaveProperty("funnel");
    expect(result).not.toHaveProperty("period");
    expect(result.health).toEqual({
      failedTransfers: 3,
      overdueHolds: 2,
      uninvoicedDelivered: 4,
      exhaustedInvoices: 1,
      openAdjustmentsTotal: 340,
      openAdjustmentsCount: 5,
    });
  });

  it("health counters are instantaneous — only the overdue-hold and uninvoiced queries carry a date bound", async () => {
    const { service, prisma } = makeService();

    await service.getFinanceOverview();

    expect(prisma.payoutTransfer.count.mock.calls[0][0].where).toEqual({
      status: { in: ["failed", "returned"] },
    });
    expect(
      prisma.paymentHold.count.mock.calls[0][0].where.releaseAt.lte,
    ).toBeInstanceOf(Date);
    expect(
      prisma.order.count.mock.calls[0][0].where.deliveredAt.lt,
    ).toBeInstanceOf(Date);
  });
});

/**
 * Fatura sayfası özet şeridi: bu ay kesilen, bekleyen, başarısız, TÜKENEN.
 * Tükenen = deneme bütçesi bitmiş failed belge — yasal süre işlerken görünmez
 * kalmamalı (eskiden yalnız cron log'una düşüyordu).
 */
describe("AdminFinanceService.getInvoicesSummary", () => {
  it("durum kırılımını ve tükenenleri döndürür", async () => {
    const prisma = {
      elogoInvoice: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { total: 900 }, _count: { id: 6 } }),
        count: jest
          .fn()
          .mockResolvedValueOnce(3) // pending
          .mockResolvedValueOnce(2) // failed
          .mockResolvedValueOnce(1), // exhausted
      },
    };
    const service = new AdminFinanceService(prisma as any, {} as any);

    const result = await service.getInvoicesSummary();

    expect(result).toEqual({
      monthIssuedCount: 6,
      monthIssuedTotal: 900,
      pendingCount: 3,
      failedCount: 2,
      exhaustedCount: 1,
    });
  });
});
