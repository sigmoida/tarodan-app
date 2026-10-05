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
    offerId: null as string | null,
    checkoutGroupId: null,
    reservationReleasedAt: null as Date | null,
  };

  /**
   * @param product ürünün rezerv sayacı (başka alıcıların rezervleri dahil);
   *   rezerv düşümü bu sayaca uygulanır.
   * @param hasPayment teklif siparişinin ödemesi başlatıldı mı (rezervin
   *   alındığı an).
   */
  const makeService = (
    product = { reservedQuantity: 1 },
    hasPayment = false,
  ) => {
    const tx: any = {
      order: {
        update: jest.fn().mockResolvedValue({ id: "o1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      offer: { update: jest.fn().mockResolvedValue({}) },
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValue(hasPayment ? { id: "pay-1" } : null),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: "p1" }]),
      // GREATEST(reserved - qty, 0) — sayaç modeli.
      $executeRaw: jest
        .fn()
        .mockImplementation((_sql: TemplateStringsArray, qty: number) => {
          product.reservedQuantity = Math.max(
            product.reservedQuantity - qty,
            0,
          );
          return Promise.resolve(1);
        }),
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

  /**
   * Rezerv yalnız gerçekten tutuluyorsa bırakılır. Teklif siparişi rezervi
   * İLK ödeme başlatmada (Payment satırıyla aynı işlemde) alır; ondan önce
   * iptal eden, aynı üründe başka bir alıcının canlı rezervini düşürüp
   * oversell'e yol açıyordu.
   */
  describe("stok rezervasyonu", () => {
    const offerOrder = { ...order, offerId: "offer-1", quantity: 1 };

    it.each(["buyer_cancelled", "admin_cancelled"] as const)(
      "ödemesi hiç başlatılmamış teklif siparişi (%s) başka alıcının rezervine dokunmaz",
      async (ledgerReason) => {
        // Ürünün tek rezervi BAŞKA bir alıcıya ait.
        const product = { reservedQuantity: 1 };
        const { service, tx } = makeService(product, false);

        await service.cancelUnpaidOrderInTx(tx, offerOrder, {
          reason: "gerekçe",
          ledgerReason,
        });

        expect(tx.$executeRaw).not.toHaveBeenCalled();
        expect(product.reservedQuantity).toBe(1);
        // Ödeme başlatmayla aynı kilit sırasında bakılır.
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.payment.findUnique).toHaveBeenCalledWith({
          where: { orderId: "o1" },
          select: { id: true },
        });
      },
    );

    it("ilk ödeme denemesinden SONRA teklif siparişi kendi rezervini bırakır; diğer alıcınınki kalır", async () => {
      // Bu siparişin 1 + başka alıcının 1 rezervi.
      const product = { reservedQuantity: 2 };
      const { service, tx } = makeService(product, true);

      await service.cancelUnpaidOrderInTx(tx, offerOrder, {
        reason: "gerekçe",
        ledgerReason: "admin_cancelled",
      });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(product.reservedQuantity).toBe(1);
    });

    it("doğrudan satış siparişi rezervini her zaman tutar (Payment'a bakılmaz)", async () => {
      const product = { reservedQuantity: 1 };
      const { service, tx } = makeService(product, false);

      await service.cancelUnpaidOrderInTx(tx, order, {
        reason: "gerekçe",
        ledgerReason: "buyer_cancelled",
      });

      expect(product.reservedQuantity).toBe(0);
      expect(tx.payment.findUnique).not.toHaveBeenCalled();
    });

    it("süpürme rezervi zaten bıraktıysa ikinci kez düşülmez", async () => {
      const product = { reservedQuantity: 1 };
      const { service, tx } = makeService(product, true);

      await service.cancelUnpaidOrderInTx(
        tx,
        { ...offerOrder, reservationReleasedAt: new Date() },
        { reason: "gerekçe", ledgerReason: "admin_cancelled" },
      );

      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(product.reservedQuantity).toBe(1);
    });
  });
});
