import { ReservationReconciliationService } from "./reservation-reconciliation.service";
import { OrderStatus, ProductStatus } from "@prisma/client";

/**
 * #1 (OVERSELL) — releaseExpiredOrderReservations YALNIZ gerçekten rezervasyon TUTAN
 * siparişleri serbest bırakmalı. Kabul-edilmiş-ödenmemiş teklif siparişi (offerId var,
 * Payment yok) HİÇ rezerve etmez; onu serbest bırakırsak paylaşılan reservedQuantity'yi
 * düşürüp başka bir siparişin/takasın CANLI rezervasyonunu çalarız → oversell.
 */
describe("ReservationReconciliationService.releaseExpiredOrderReservations (#1 oversell)", () => {
  const makeService = (expiredOrders: any[]) => {
    const captured = { productUpdate: undefined as any };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          status: OrderStatus.pending_payment,
          reservationReleasedAt: null,
          quantity: 1,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          reservedQuantity: 1,
          quantity: 1,
          status: ProductStatus.active,
        }),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.productUpdate = arg;
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue(expiredOrders) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const cache = { del: jest.fn().mockResolvedValue(undefined) } as any;
    const config = { get: jest.fn().mockReturnValue("5") } as any;
    const notifications = {
      notifyReservationReleased: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new ReservationReconciliationService(
      prisma,
      cache,
      config,
      notifications,
    );
    return { svc, prisma, tx, captured };
  };

  it("sorgu YALNIZ rezerve-tutan siparişleri seçer (offerId null VEYA payment var)", async () => {
    const { svc, prisma } = makeService([]);
    await svc.releaseExpiredOrderReservations();
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OrderStatus.pending_payment,
          reservationReleasedAt: null,
          OR: [
            { offerId: null },
            { offerId: { not: null }, payment: { isNot: null } },
          ],
        }),
      }),
    );
  });

  it("rezerve-tutan (direct-buy) sipariş için reservedQuantity düşürülür (1→0)", async () => {
    const { svc, captured, tx } = makeService([
      {
        id: "o1",
        productId: "p1",
        orderNumber: "ORD1",
        buyerId: "b1",
        product: { title: "Ürün" },
      },
    ]);
    const res = await svc.releaseExpiredOrderReservations();
    expect(res.count).toBe(1);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    // safeDecrementReserved(1, 1) = 0
    expect(captured.productUpdate.data.reservedQuantity).toBe(0);
  });
});
