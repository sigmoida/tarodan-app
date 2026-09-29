import { CancellationActor, OrderStatus } from "@prisma/client";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * Ödenmemiş iptalin aktörü ledger gerekçesinden türetilir: alıcının kendi
 * iptali `buyer`, yönetici teklif iptalinin kapattığı sipariş `platform`.
 * İkisi ayrı parametre olsaydı birbirleriyle çelişebilirlerdi.
 */
describe("OrderLifecycleService.cancelUnpaidOrderInTx — iptal aktörü", () => {
  const order = {
    id: "o1",
    status: OrderStatus.pending_payment,
    version: 2,
    quantity: 1,
    productId: "p1",
    offerId: null,
    checkoutGroupId: null,
    reservationReleasedAt: null,
  };

  const makeService = () => {
    const tx: any = {
      order: {
        update: jest.fn().mockResolvedValue({ id: "o1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      offer: { update: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const commissionLedger = {
      markWaived: jest.fn().mockResolvedValue(undefined),
    };
    const discountService = {
      releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderLifecycleService(
      {} as any, // prisma
      {} as any, // cache
      {} as any, // notificationService
      {} as any, // productLockService
      commissionLedger as any,
      {} as any, // orderCommon
      {} as any, // orderQuery
      {} as any, // elogoInvoicing
      discountService as any,
    );
    return { service, tx };
  };

  it.each([
    ["buyer_cancelled", CancellationActor.buyer],
    ["admin_cancelled", CancellationActor.platform],
  ] as const)("%s → %s", async (ledgerReason, actor) => {
    const { service, tx } = makeService();

    await service.cancelUnpaidOrderInTx(tx, order, {
      reason: "gerekçe",
      ledgerReason,
    });

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "o1", version: 2 },
        data: expect.objectContaining({
          status: OrderStatus.cancelled,
          cancelledAt: expect.any(Date),
          cancelledBy: actor,
          cancelReason: "gerekçe",
        }),
      }),
    );
  });
});
