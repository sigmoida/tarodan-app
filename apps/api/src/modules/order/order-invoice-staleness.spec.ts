import { OrderStatus } from "@prisma/client";
import { OrderSchedulerService } from "./order-scheduler.service";

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
  const makeService = (counts: {
    stuckShipped: number;
    uninvoiced: number;
  }) => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.status === OrderStatus.shipped
                ? counts.stuckShipped
                : counts.uninvoiced,
            ),
          ),
      },
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
      { issueTradeCashCommissionInvoice: jest.fn() } as any,
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
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ORDERS_STUCK_SHIPPED"),
    );
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

    expect(result).toEqual({ stuckShipped: 0, uninvoicedDelivered: 0 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("staleness raporu teslim turu ile birlikte çalışır", async () => {
    const { service } = makeService({ stuckShipped: 1, uninvoiced: 1 });
    const spy = jest.spyOn(service, "reportInvoiceStaleness");

    await service.runProcessDeliveredOrders();

    expect(spy).toHaveBeenCalled();
  });
});
