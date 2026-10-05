import { OrderSchedulerService } from "./order-scheduler.service";

/**
 * Backfill, faturaları ZATEN tam olan siparişi `revenueInvoicedAt` ile
 * işaretlemeli.
 *
 * İşaret yalnız `issueOrderRevenueInvoices` sarmalında konuyordu; faturaları
 * tekil tetiklerle (confirmDelivery/completeOrder) kesilen siparişler işaretsiz
 * kalıyor ve backfill onları "faturalar var" diye atlarken İŞARETLEMEDİĞİ için
 * `take:500` aday penceresinde sonsuza dek yer tutuyorlardı — işaretin tam da
 * çözmek için eklendiği pencere-doygunluğu hatası geri dönüyordu.
 */
describe("OrderSchedulerService — fatura backfill işareti", () => {
  const makeService = (
    candidate: Record<string, unknown> = {
      id: "order-1",
      commissionLedger: { buyerFee: 30, sellerCommission: 100 },
      seller: { sellerType: "individual" },
    },
    invoices: Array<{ sourceId: string; type: string }> = [
      { sourceId: "order-1", type: "commission" },
      { sourceId: "order-1", type: "service_fee" },
    ],
  ) => {
    const prisma = {
      order: {
        // 1. çağrı: backfill adayları; 2. çağrı: iade penceresi kapananlar.
        findMany: jest
          .fn()
          .mockResolvedValueOnce([candidate])
          .mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      elogoInvoice: {
        // Beklenen her iki fatura türü de mevcut → sipariş tam faturalı.
        findMany: jest.fn().mockResolvedValue(invoices),
      },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      // İade penceresi Süreler ve Kurallar'dan; satır yok → varsayılan.
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const orderService = { emitDeliveryRevenueInvoices: jest.fn() };
    const service = new OrderSchedulerService(
      prisma as any,
      orderService as any,
      { get: jest.fn() } as any,
      {} as any,
      // Satıcı ürün faturası taraması bu senaryonun konusu değil.
      { remindMissing: async () => ({ missing: 0, reminded: 0 }) } as any,
      { createInAppNotification: jest.fn() } as any,
      { get: jest.fn(), set: jest.fn() } as any,
      { add: jest.fn() } as any,
    );
    return { service, prisma, orderService };
  };

  it("tam faturalı ama işaretsiz siparişi revenueInvoicedAt ile işaretler", async () => {
    const { service, prisma, orderService } = makeService();

    await service.runProcessDeliveredOrders();

    // Yeniden faturalama YOK (idempotent atlama sürer)...
    expect(orderService.emitDeliveryRevenueInvoices).not.toHaveBeenCalled();
    // ...ama sipariş işaretlenir ve aday penceresinden kalıcı olarak çıkar.
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: expect.objectContaining({
          revenueInvoicedAt: expect.any(Date),
        }),
      }),
    );
  });

  /**
   * Kırılımı OLMAYAN defterde altı bileşen sütunu da 0'dır; "hizmet başına
   * belgeler tam mı?" testi bu yüzden kendiliğinden doğru döner. İki nesli
   * OR'lamak, kesilmemiş birleşik komisyon faturası olan siparişi faturalanmış
   * işaretleyip bir daha hiç denemiyordu — gelir belgesi kalıcı olarak kaybolur.
   */
  it("kırılımı olmayan defterde birleşik belge eksikse sipariş İŞARETLENMEZ", async () => {
    const { service, prisma } = makeService(
      {
        id: "order-1",
        packageId: "pkg-1",
        buyerShippingAmount: 40,
        commissionLedger: {
          buyerFee: 30,
          sellerCommission: 100,
          componentBreakdownComplete: false,
          buyerCommissionAmount: 0,
          buyerPlatformFeeAmount: 0,
          sellerCommissionAmount: 0,
          sellerPlatformFeeAmount: 0,
        },
        seller: { sellerType: "individual" },
      },
      // Yalnız kargo belgesi kesilmiş; birleşik komisyon/hizmet bedeli YOK.
      [{ sourceId: "pkg-1", type: "buyer_shipping" }],
    );

    await service.runProcessDeliveredOrders();

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  /**
   * Kargo belgeleri yalnız PAKET anahtarlı kesilir; paketi olmayan eski
   * siparişte hiç doğmaz. Orada aranırsa sipariş sonsuza dek aday penceresinde
   * kalır — işaretin çözdüğü doygunluk hatası geri gelir.
   */
  it("paketi olmayan siparişte kargo belgesi aranmaz", async () => {
    const { service, prisma } = makeService(
      {
        id: "order-1",
        packageId: null,
        buyerShippingAmount: 40,
        commissionLedger: { buyerFee: 30, sellerCommission: 100 },
        seller: { sellerType: "individual" },
      },
      [
        { sourceId: "order-1", type: "commission" },
        { sourceId: "order-1", type: "service_fee" },
      ],
    );

    await service.runProcessDeliveredOrders();

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" } }),
    );
  });

  /**
   * Teslim → tamamlandı geçişi iade penceresi kapanınca olur. Damgalı
   * siparişte teslimdeki pencere sonu (`returnWindowEndsAt ≤ şimdi`) geçerlidir
   * — escrow ve iade uygunluğu da onu okur. Damgasız eski siparişte bugünkü
   * değerle `deliveredAt ≤ şimdi − N gün` kesilir.
   */
  describe("iade penceresi kapanışı — damga ve süre kaynağı", () => {
    const NOW = new Date("2026-10-05T12:00:00.000Z");
    const DAY = 24 * 60 * 60 * 1000;
    afterEach(() => jest.useRealTimers());

    const completionWhere = async (setting: string | null) => {
      jest.useFakeTimers({ now: NOW, doNotFake: ["setImmediate"] });
      const { service, prisma } = makeService();
      prisma.platformSetting.findUnique.mockImplementation(
        async ({ where }: { where: { settingKey: string } }) =>
          setting !== null && where.settingKey === "return_window_days"
            ? { settingValue: setting }
            : null,
      );
      await service.runProcessDeliveredOrders();
      const completionCall: any[] =
        prisma.order.findMany.mock.calls.find(
          (call: any[]) => call[0]?.where?.OR?.[1]?.deliveredAt?.lte,
        ) ?? [];
      return completionCall[0].where;
    };
    const legacyCutoffAge = (where: any) =>
      (NOW.getTime() - (where.OR[1].deliveredAt.lte as Date).getTime()) / DAY;

    it("damgalı sipariş kendi pencere sonunda tamamlanır", async () => {
      const where = await completionWhere("30");
      expect(where.OR[0]).toEqual({ returnWindowEndsAt: { lte: NOW } });
    });

    it("damgasız eski sipariş: admin değeri yokken bugünkü gibi 14 gün", async () => {
      const where = await completionWhere(null);
      expect(where.OR[1].returnWindowEndsAt).toBeNull();
      expect(legacyCutoffAge(where)).toBe(14);
    });

    it("damgasız eski sipariş: admin değeri geçerlidir", async () => {
      expect(legacyCutoffAge(await completionWhere("21"))).toBe(21);
    });
  });
});
