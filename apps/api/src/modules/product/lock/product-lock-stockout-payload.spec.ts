import { CancellationActor } from "@prisma/client";
import { ProductLockService } from "./product-lock.service";
import { ORDER_CANCEL_REASON } from "../../order/helpers/order-cancel-reasons";
import { TRADE_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";

/**
 * Regression: invalidatePendingOrdersForProduct must report each cancelled
 * order's origin so the caller can pick the right stockout notification.
 *
 * An accepted-but-unpaid offer creates a pending_payment Order with offerId set
 * and NO payment row. When stock runs out, that buyer should get
 * "Teklifiniz iptal edildi" (offer-cancelled), not "Siparişiniz iptal edildi".
 * Direct-buy / already-paying orders keep the order-cancelled message.
 */
describe("ProductLockService.invalidatePendingOrdersForProduct payload", () => {
  const productId = "prod-1";

  const offerUnpaidOrder = {
    id: "order-offer",
    buyerId: "buyer-offer",
    productId,
    offerId: "offer-1",
    checkoutGroupId: null,
    product: { title: "Teklif Ürünü" },
    payment: null,
  };
  const directBuyOrder = {
    id: "order-direct",
    buyerId: "buyer-direct",
    productId,
    offerId: null,
    checkoutGroupId: null,
    product: { title: "Doğrudan Ürün" },
    payment: { id: "pay-1" },
  };

  function buildService(orders: any[]) {
    const tx = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        updateMany: jest.fn().mockResolvedValue({ count: orders.length }),
      },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new ProductLockService({} as any, {} as any);
    return { service, tx };
  }

  it("flags offer-origin unpaid orders (offerId set, hadPayment=false)", async () => {
    const { service, tx } = buildService([offerUnpaidOrder]);

    const result = await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      "Stok tükendi",
    );

    expect(result.cancelledOrders).toEqual([
      expect.objectContaining({
        orderId: "order-offer",
        buyerId: "buyer-offer",
        offerId: "offer-1",
        hadPayment: false,
      }),
    ]);
  });

  it("flags direct-buy / paying orders as hadPayment=true, offerId=null", async () => {
    const { service, tx } = buildService([directBuyOrder]);

    const result = await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      "Stok tükendi",
    );

    expect(result.cancelledOrders[0]).toEqual(
      expect.objectContaining({ offerId: null, hadPayment: true }),
    );
  });

  it("releases the coupon reservation for a checkout group cancelled by stockout", async () => {
    const groupOrder = {
      ...directBuyOrder,
      checkoutGroupId: "group-1",
    };
    const groupSibling = { id: "order-sibling" };
    const discount = {
      releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
    };
    const tx = {
      order: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([groupOrder])
          .mockResolvedValueOnce([groupOrder, groupSibling]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new ProductLockService(
      {} as any,
      {} as any,
      discount as any,
    );

    await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      "Stok tükendi",
    );

    expect(discount.releaseReservedUsageForOrders).toHaveBeenCalledWith(
      ["order-direct", "order-sibling"],
      tx,
    );
  });

  /**
   * Stok kaskadı: alıcı da satıcı da iptal etmedi. Varsayılan gerekçe takasın
   * son adedi ayırdığı durumdur (trade-lifecycle aynı sabiti geçer).
   */
  it("stamps the cascade as a system cancellation with the given or default reason", async () => {
    const { service, tx } = buildService([directBuyOrder]);

    await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      ORDER_CANCEL_REASON.stockDepleted,
    );
    await service.invalidatePendingOrdersForProduct(tx as any, productId);

    const [first, second] = tx.order.updateMany.mock.calls.map(
      (call: any[]) => call[0].data,
    );
    expect(first).toEqual({
      status: "cancelled",
      cancelledAt: expect.any(Date),
      cancelledBy: CancellationActor.system,
      cancelReason: ORDER_CANCEL_REASON.stockDepleted,
    });
    expect(second).toEqual(
      expect.objectContaining({
        cancelledBy: CancellationActor.system,
        cancelReason: ORDER_CANCEL_REASON.stockReservedForTrade,
      }),
    );
  });
});

describe("ProductLockService.invalidateRelatedTrades", () => {
  it("cancels pending trades as a system cancellation (stock depleted)", async () => {
    const tx = {
      tradeItem: {
        findMany: jest.fn().mockResolvedValue([{ tradeId: "t1" }]),
      },
      trade: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "t1",
            initiatorId: "u1",
            receiverId: "u2",
            status: "pending",
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new ProductLockService({} as any, {} as any);

    await service.invalidateRelatedTrades(tx as any, "prod-1");

    expect(tx.trade.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1"] } },
      data: {
        status: "cancelled",
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.system,
        cancelReason: TRADE_CANCEL_REASON.stockDepleted,
      },
    });
  });
});
