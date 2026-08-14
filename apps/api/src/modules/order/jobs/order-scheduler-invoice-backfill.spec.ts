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
  const makeService = () => {
    const prisma = {
      order: {
        // 1. çağrı: backfill adayları; 2. çağrı: iade penceresi kapananlar.
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "order-1",
              commissionLedger: { buyerFee: 30, sellerCommission: 100 },
              seller: { sellerType: "individual" },
            },
          ])
          .mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      elogoInvoice: {
        // Beklenen her iki fatura türü de mevcut → sipariş tam faturalı.
        findMany: jest.fn().mockResolvedValue([
          { sourceId: "order-1", type: "commission" },
          { sourceId: "order-1", type: "service_fee" },
        ]),
      },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
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
});
