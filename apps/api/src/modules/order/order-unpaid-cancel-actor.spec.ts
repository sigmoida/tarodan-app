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

  it("yönetici iptalinin katalog kodunu aynı yazımda saklar; alıcı iptalinde kod yazılmaz", async () => {
    const { service, tx } = makeService();

    await service.cancelUnpaidOrderInTx(tx, order, {
      reason: "Yönetici tarafından iptal edildi: Stok hatası",
      ledgerReason: "admin_cancelled",
      adminReasonCode: "stock_error",
    });
    expect(tx.order.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ adminCancelReasonCode: "stock_error" }),
    );

    tx.order.update.mockClear();
    await service.cancelUnpaidOrderInTx(tx, order, {
      reason: "gerekçe",
      ledgerReason: "buyer_cancelled",
    });
    expect(
      tx.order.update.mock.calls[0][0].data.adminCancelReasonCode,
    ).toBeUndefined();
  });

  describe("bağlı teklif", () => {
    const offerOrder = { ...order, offerId: "offer-1" };

    it("varsayılan: teklif 'bağlı sipariş iptal edildi' gerekçesiyle kapanır", async () => {
      const { service, tx } = makeService();

      await service.cancelUnpaidOrderInTx(tx, offerOrder, {
        reason: "gerekçe",
        ledgerReason: "buyer_cancelled",
      });

      expect(tx.offer.update).toHaveBeenCalledWith({
        where: { id: "offer-1" },
        data: {
          status: "cancelled",
          cancelReason: "Bağlı sipariş iptal edildiği için teklif kapatıldı",
        },
      });
    });

    it("yönetici iptali teklife kendi gerekçesini yazar (teklif ekranı yönetici iptalini görür)", async () => {
      const { service, tx } = makeService();

      await service.cancelUnpaidOrderInTx(tx, offerOrder, {
        reason: "Yönetici tarafından iptal edildi: Şüpheli işlem",
        ledgerReason: "admin_cancelled",
        adminReasonCode: "suspicious_activity",
        offerCancelReason: "Yönetici tarafından iptal edildi: Şüpheli işlem",
      });

      expect(tx.offer.update).toHaveBeenCalledWith({
        where: { id: "offer-1" },
        data: {
          status: "cancelled",
          cancelReason: "Yönetici tarafından iptal edildi: Şüpheli işlem",
        },
      });
    });
  });
});
