import { OrderStatus } from "@prisma/client";
import { OrderSchedulerService } from "../jobs/order-scheduler.service";

/**
 * HIGH (eLogo): kargo poll'u teslimatı hiç raporlamazsa sipariş `shipped`'te takılı
 * kalır. Faturalama yalnız `delivered`/`completed` siparişleri süzdüğü için gerçekten
 * teslim edilmiş ama poll'lanmamış sipariş HİÇ fatura almaz — ne süre takibi ne alarm
 * vardı; tek kurtarma admin'in elle "teslim edildi" işaretlemesi.
 *
 * Ayrıca teslim edilmiş olup bir türlü faturalanamayan siparişler de görünür olmalı
 * (e-Arşiv 7 gün).
 */
describe("OrderSchedulerService — invoice staleness alarms", () => {
  const makeService = (
    counts: { stuckShipped: number; uninvoiced: number },
    sellerInvoices: { missing: number; reminded: number } = {
      missing: 0,
      reminded: 0,
    },
  ) => {
    const stuckRows = Array.from(
      { length: counts.stuckShipped },
      (_, index) => ({
        id: `order-${index}`,
        orderNumber: `ORD-${index}`,
        sellerId: "seller-1",
        shipment: { shippedAt: new Date("2026-07-01T00:00:00.000Z") },
      }),
    );
    const prisma = {
      order: {
        // Takılı kargolar artık SAYI değil satır olarak çekilir (alarm sipariş
        // numaralarını içerir + admin bildirimi gönderilir).
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.status === OrderStatus.shipped ? stuckRows : [],
            ),
          ),
        count: jest.fn().mockResolvedValue(counts.uninvoiced),
      },
      adminUser: { findMany: jest.fn().mockResolvedValue([]) },
      elogoInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    const service = new OrderSchedulerService(
      prisma as any,
      {
        emitDeliveryRevenueInvoices: jest.fn(),
        autoCompleteDeliveredOrder: jest.fn(),
      } as any,
      { get: () => undefined } as any,
      { issueTradeCashFeeInvoice: jest.fn() } as any,
      { remindMissing: async () => sellerInvoices } as any,
      { createInAppNotification: jest.fn() } as any,
      { get: jest.fn(), set: jest.fn() } as any,
      {} as any,
    );
    (service as any).logger = logger;
    return { service, logger };
  };

  it("uzun süre `shipped`'te takılı siparişler alarm verir", async () => {
    const { service, logger } = makeService({
      stuckShipped: 3,
      uninvoiced: 0,
    });

    const result = await service.reportInvoiceStaleness();

    expect(result.stuckShipped).toBe(3);
    // Alarm eyleme dönük olmalı: sipariş numaraları görünmeli (eskiden yalnız
    // sayı vardı, admin hangi siparişi kurtaracağını bilemiyordu).
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ORDERS_STUCK_SHIPPED"),
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("ORD-0"));
  });

  it("teslim edilip yasal süre içinde faturalanamayan siparişler alarm verir", async () => {
    const { service, logger } = makeService({
      stuckShipped: 0,
      uninvoiced: 2,
    });

    const result = await service.reportInvoiceStaleness();

    expect(result.uninvoicedDelivered).toBe(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ORDERS_DELIVERED_UNINVOICED"),
    );
  });

  it("her şey yolundaysa alarm verilmez", async () => {
    const { service, logger } = makeService({ stuckShipped: 0, uninvoiced: 0 });

    const result = await service.reportInvoiceStaleness();

    expect(result).toEqual({
      stuckShipped: 0,
      uninvoicedDelivered: 0,
      missingSellerInvoices: 0,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  // Tarodan'ın kendi e-Arşivleri için alarm vardı; ürün faturasını KESEN taraf
  // satıcı olduğunda hiçbir sinyal yoktu — yüklenmeyen fatura sessizce kayboluyordu.
  it("kurumsal satıcının yüklemediği ürün faturaları alarm verir", async () => {
    const { service, logger } = makeService(
      { stuckShipped: 0, uninvoiced: 0 },
      { missing: 3, reminded: 2 },
    );

    const result = await service.reportInvoiceStaleness();

    expect(result.missingSellerInvoices).toBe(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("SELLER_INVOICE_MISSING count=3 reminded=2"),
    );
  });

  it("staleness raporu teslim turu ile birlikte çalışır", async () => {
    const { service } = makeService({ stuckShipped: 1, uninvoiced: 1 });
    const spy = jest.spyOn(service, "reportInvoiceStaleness");

    await service.runProcessDeliveredOrders();

    expect(spy).toHaveBeenCalled();
  });
});
