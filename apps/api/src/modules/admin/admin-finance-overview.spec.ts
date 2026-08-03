import { AdminFinanceService } from "./admin-finance.service";

/**
 * Finans özeti: admin'in "para nerede?" sorusuna TEK bakışta cevap.
 *
 * Huni: Tahsilat (dönem) → Escrow'da bekleyen (anlık) → Satıcıya transfer
 * edilen (dönem) → Platform NET geliri (dönem, ledger formülü). Sağlık şeridi:
 * başarısız/dönen transferler, süresi geçmiş hold'lar, faturasız teslimatlar,
 * deneme bütçesi tükenmiş eLogo belgeleri, açık satıcı borçları. Bu sayılar
 * zaten üretiliyordu ama yalnız log'a gidiyordu — admin yüzeyine iner.
 */
describe("AdminFinanceService.getFinanceOverview", () => {
  const makeService = () => {
    const prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 5000 }, _count: { id: 12 } }),
      },
      paymentHold: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 1800 }, _count: { id: 7 } }),
        count: jest.fn().mockResolvedValue(2), // süresi geçmiş held
      },
      payoutTransfer: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { netAmount: 2500 }, _count: { id: 9 } }),
        count: jest.fn().mockResolvedValue(3), // failed/returned
      },
      commissionLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            sellerCommission: 400,
            refundedSellerCommission: 50,
            buyerFee: 120,
            refundedBuyerFee: 20,
          },
        }),
      },
      order: { count: jest.fn().mockResolvedValue(4) }, // faturasız teslimat
      elogoInvoice: { count: jest.fn().mockResolvedValue(1) }, // tükenen
      // Dönemin GERÇEK PSP kesintisi: defterdeki psp_fee debit toplamı
      // (PayTR ekstresinden eşleştirilip yazılır) — tahmini oran DEĞİL.
      ledgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
      },
      sellerAccountAdjustment: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { remainingAmount: 340 },
          _count: { id: 5 },
        }),
      },
    };
    return { service: new AdminFinanceService(prisma as any), prisma };
  };

  it("huni + sağlık alanlarını tek yanıtta toplar", async () => {
    const { service } = makeService();

    const result = await service.getFinanceOverview();

    expect(result.funnel).toEqual({
      collectedTotal: 5000,
      collectedCount: 12,
      escrowHeldTotal: 1800,
      escrowHeldCount: 7,
      transferredTotal: 2500,
      transferredCount: 9,
      // Ledger formülü: (400−50)+(120−20)
      platformRevenueNet: 450,
      // PSP kesintisi komisyon gelirinin İÇİNDEN çıkar: hak ediş 450 − 30.
      pspFeeTotal: 30,
      platformNetAfterPsp: 420,
    });
    expect(result.health).toEqual({
      failedTransfers: 3,
      overdueHolds: 2,
      uninvoicedDelivered: 4,
      exhaustedInvoices: 1,
      openAdjustmentsTotal: 340,
      openAdjustmentsCount: 5,
    });
  });

  it("tahsilat yalnız completed ödemeleri sayar", async () => {
    const { service, prisma } = makeService();

    await service.getFinanceOverview();

    expect(prisma.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("PSP kesintisini defterdeki psp_fee DEBIT satırlarından toplar", async () => {
    const { service, prisma } = makeService();

    await service.getFinanceOverview();

    expect(prisma.ledgerEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: "psp_fee",
          direction: "debit",
        }),
        _sum: { amount: true },
      }),
    );
  });

  it("defterde PSP satırı yoksa hak ediş komisyon gelirine eşittir", async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await service.getFinanceOverview();

    expect(result.funnel.pspFeeTotal).toBe(0);
    expect(result.funnel.platformNetAfterPsp).toBe(450);
  });

  it("transfer toplamı yalnız completed transferlerin NET tutarıdır", async () => {
    const { service, prisma } = makeService();

    await service.getFinanceOverview();

    expect(prisma.payoutTransfer.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed" }),
        _sum: { netAmount: true },
      }),
    );
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
    const service = new AdminFinanceService(prisma as any);

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
