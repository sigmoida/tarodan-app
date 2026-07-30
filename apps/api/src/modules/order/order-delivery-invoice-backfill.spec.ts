import { OrderSchedulerService } from "./order-scheduler.service";
import { OrderStatus } from "@prisma/client";

/**
 * HIGH (eLogo): teslim faturası backfill cron'u `take: 500` ile, `orderBy` OLMADAN
 * ve "henüz faturalanmamış" SQL filtresi OLMADAN sorgulanıyordu. Tamamlanan
 * siparişler aday kümesinden hiç çıkmadığı için platform ömür boyu 500 teslim
 * edilmiş siparişi geçtiğinde sırasız pencere YENİ teslimatları kalıcı olarak
 * dışarıda bırakabiliyordu → fatura 14 gün gecikiyor ya da hiç kesilmiyor
 * (e-Arşiv 7 gün kuralı ihlali).
 *
 * Çözüm: siparişte açık bir "gelir faturası kesildi" işareti tutulur; cron yalnız
 * işaretlenmemişleri, en yeni teslimattan başlayarak sorgular.
 */
describe("OrderSchedulerService.runProcessDeliveredOrders — invoice candidate query", () => {
  const makeService = () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        // Faturalama sağlığı alarmları (reportInvoiceStaleness) sayaç sorgular.
        count: jest.fn().mockResolvedValue(0),
      },
      elogoInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrderSchedulerService(
      prisma as any,
      {
        emitDeliveryRevenueInvoices: jest.fn(),
        autoCompleteDeliveredOrder: jest.fn(),
      } as any,
      { get: () => undefined } as any,
      { issueTradeCashCommissionInvoice: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma };
  };

  it("yalnız gelir faturası kesilmemiş siparişler aday olur", async () => {
    const { service, prisma } = makeService();

    await service.runProcessDeliveredOrders();

    const candidateCall = prisma.order.findMany.mock.calls.find((call: any) =>
      call[0]?.where?.status?.in?.includes(OrderStatus.delivered),
    );
    expect(candidateCall).toBeDefined();
    expect(candidateCall[0].where.revenueInvoicedAt).toBeNull();
  });

  it("aday sorgusu en yeni teslimattan başlar (sırasız pencere doyumu olmaz)", async () => {
    const { service, prisma } = makeService();

    await service.runProcessDeliveredOrders();

    const candidateCall = prisma.order.findMany.mock.calls.find(
      (call: any) => call[0]?.where?.revenueInvoicedAt === null,
    );
    expect(candidateCall[0].orderBy).toBeDefined();
  });

  it("takas komisyonu adayları da sıralanır", async () => {
    const { service, prisma } = makeService();

    await service.runProcessDeliveredOrders();

    const tradeCall = prisma.tradeCashPayment.findMany.mock.calls[0][0];
    expect(tradeCall.orderBy).toBeDefined();
  });
});
