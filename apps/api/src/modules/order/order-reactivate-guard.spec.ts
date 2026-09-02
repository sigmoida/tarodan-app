import { OrderLifecycleService } from "./order-lifecycle.service";
import { isReactivatablePayment } from "./order-common.service";

/**
 * "Ödemeyi tamamla" / reactivate yalnız HİÇ ödenmemiş teklif siparişi içindir.
 * Tam iade edilmiş sipariş de `cancelled` + (eskiden) `accepted` teklif taşıdığı
 * için ikinci kez tahsilata açılabiliyordu.
 */
describe("order reactivate — ödenmiş/iade edilmiş sipariş kapısı", () => {
  const baseOrder = {
    id: "o1",
    buyerId: "buyer-1",
    productId: "p1",
    offerId: "of1",
    status: "cancelled",
    offer: { status: "accepted" },
    product: { quantity: 5, reservedQuantity: 0 },
    stockRestoredAt: null,
    payment: null,
  };

  const makeService = (order: any) => {
    const tx = {
      order: { update: jest.fn().mockResolvedValue({}) },
      offer: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const productLock = { checkAndReserve: jest.fn().mockResolvedValue(true) };
    const orderQuery = { findOne: jest.fn().mockResolvedValue({ id: "o1" }) };
    const service = new OrderLifecycleService(
      prisma as any,
      {} as any,
      {} as any,
      productLock as any,
      {} as any,
      {} as any,
      orderQuery as any,
      {} as any,
    );
    return { service, prisma, tx, productLock };
  };

  it("isReactivatablePayment: ödeme yoksa/başarısızsa true, completed/refunded veya stok geri yüklendiyse false", () => {
    expect(isReactivatablePayment({ payment: null })).toBe(true);
    expect(isReactivatablePayment({ payment: { status: "failed" } })).toBe(
      true,
    );
    expect(isReactivatablePayment({ payment: { status: "completed" } })).toBe(
      false,
    );
    expect(isReactivatablePayment({ payment: { status: "refunded" } })).toBe(
      false,
    );
    expect(
      isReactivatablePayment({ stockRestoredAt: new Date(), payment: null }),
    ).toBe(false);
  });

  it("iade edilmiş (payment refunded) sipariş 400 reactivateAlreadyPaid alır", async () => {
    const { service, productLock } = makeService({
      ...baseOrder,
      payment: { status: "refunded" },
    });

    await expect(service.reactivate("o1", "buyer-1")).rejects.toMatchObject({
      response: { i18nKey: "server.order.reactivateAlreadyPaid" },
    });
    expect(productLock.checkAndReserve).not.toHaveBeenCalled();
  });

  it("stoğu geri yüklenmiş sipariş de reddedilir", async () => {
    const { service } = makeService({
      ...baseOrder,
      stockRestoredAt: new Date(),
    });

    await expect(service.reactivate("o1", "buyer-1")).rejects.toMatchObject({
      response: { i18nKey: "server.order.reactivateAlreadyPaid" },
    });
  });

  it("hiç ödenmemiş (payment yok / süresi dolmuş) sipariş yeniden açılır", async () => {
    const { service, tx, productLock, prisma } = makeService({
      ...baseOrder,
      offer: { status: "payment_expired" },
    });

    await service.reactivate("o1", "buyer-1");

    expect(prisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          payment: { select: { status: true } },
          checkoutGroup: { select: { payment: { select: { status: true } } } },
        }),
      }),
    );
    expect(productLock.checkAndReserve).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      1,
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending_payment" }),
      }),
    );
    expect(tx.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "accepted" } }),
    );
  });
});
