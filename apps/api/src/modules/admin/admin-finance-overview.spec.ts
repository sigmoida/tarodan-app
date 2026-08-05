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
      // Takas hizmet bedeli: KDV DAHİL 120 tahsil edildi (%20 → matrah 100).
      tradeCashPayment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { tradeFeeAmount: 120 } }),
      },
    };
    const taxPolicy = {
      resolve: jest
        .fn()
        .mockResolvedValue({ serviceVatEnabled: true, serviceVatRate: 20 }),
      effectiveServiceVatRate: (p: any) =>
        p.serviceVatEnabled ? p.serviceVatRate : 0,
    };
    return {
      service: new AdminFinanceService(prisma as any, taxPolicy as any),
      prisma,
    };
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
      // Ledger formülü (400−50)+(120−20)=450 + takas ücreti matrahı 100.
      platformRevenueNet: 550,
      tradeFeeRevenueNet: 100,
      tradeFeeCollected: 120,
      // PSP kesintisi gelirin İÇİNDEN çıkar: hak ediş 550 − 30.
      pspFeeTotal: 30,
      platformNetAfterPsp: 520,
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

  it("defterde PSP satırı yoksa hak ediş gelire eşittir", async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await service.getFinanceOverview();

    expect(result.funnel.pspFeeTotal).toBe(0);
    expect(result.funnel.platformNetAfterPsp).toBe(550);
  });

  /**
   * Takas geliri `commissionLedger`'da HİÇ görünmez (o tablo sipariş bazlıdır).
   * Buradan gelmezse platform geliri takasların TAMAMI kadar eksik raporlanır.
   */
  it("takas hizmet bedelini yalnız ödemesi tamamlanmış satırlardan toplar", async () => {
    const { service, prisma } = makeService();

    await service.getFinanceOverview();

    expect(prisma.tradeCashPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed" }),
        _sum: { tradeFeeAmount: true },
      }),
    );
  });

  it("hizmet KDV'si kapalıysa ücretin tamamı gelir yazılır", async () => {
    const prisma = (makeService() as any).prisma;
    const taxPolicy = {
      resolve: jest
        .fn()
        .mockResolvedValue({ serviceVatEnabled: false, serviceVatRate: 20 }),
      effectiveServiceVatRate: (p: any) =>
        p.serviceVatEnabled ? p.serviceVatRate : 0,
    };
    const service = new AdminFinanceService(prisma as any, taxPolicy as any);

    const result = await service.getFinanceOverview();

    expect(result.funnel.tradeFeeRevenueNet).toBe(120);
    expect(result.funnel.platformRevenueNet).toBe(570);
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
