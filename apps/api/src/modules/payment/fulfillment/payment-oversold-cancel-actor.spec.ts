import { CancellationActor, OrderStatus } from "@prisma/client";
import { ORDER_CANCEL_REASON } from "../../order/helpers/order-cancel-reasons";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

/**
 * Ödeme alındı ama fiziksel stok sipariş adedini karşılamadı: sipariş
 * kimsenin kararı olmadan kapanır → SİSTEM iptali, sabit gerekçe. Otomatik
 * iade de aynı aktörü taşır (processRefund zaten iptal edilmiş siparişin
 * aktörünü korur).
 */
describe("PaymentFulfillmentService — ödeme sonrası stok yetersizliği iptali", () => {
  const order = {
    id: "order-1",
    orderNumber: "ORD-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    quantity: 3,
    totalAmount: 300,
    status: OrderStatus.pending_payment,
    shippingAddress: { fullName: "Alıcı" },
    buyer: { id: "buyer-1", email: "b@x.com", displayName: "Alıcı" },
    seller: { id: "seller-1", email: "s@x.com", displayName: "Satıcı" },
    product: { id: "product-1", title: "Ürün" },
  };

  it("siparişi sistem aktörü ve stok yetersizliği gerekçesiyle iptal eder, iadeyi de sistem adına ister", async () => {
    const tx: any = {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            status: OrderStatus.pending_payment,
            orderNumber: "ORD-1",
          })
          .mockResolvedValue(order),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
      wishlistItem: { findMany: jest.fn().mockResolvedValue([]) },
      productBoost: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new PaymentFulfillmentService(
      prisma,
      {
        del: jest.fn().mockResolvedValue(undefined),
        delPattern: jest.fn().mockResolvedValue(undefined),
      } as never,
      { get: jest.fn() } as never,
      {
        emitOrderFulfillmentRequested: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        notifyStockoutCascade: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {
        decrementForOrder: jest.fn().mockResolvedValue({
          cancelledOrders: [],
          cancelledOffers: [],
          oversold: { productId: "product-1", paidQty: 3, physicalQty: 1 },
        }),
      } as never,
      {
        createInAppNotification: jest.fn().mockResolvedValue(true),
      } as never,
      { createHold: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      paymentRefund as never,
      { recordTradeCashCapture: jest.fn() } as never,
      {
        consumeReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
        releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
      } as never,
      undefined,
    );

    // Tahsilat sonrası yan etkiler bu sahtelerle tamamlanmayabilir; bu spec
    // yalnız iptal yazımına ve iade isteğine bakar.
    await service
      .processSuccessfulPayment(
        {
          id: "pay-1",
          orderId: order.id,
          order,
          status: "pending",
          metadata: {},
          provider: "paytr",
        },
        "txn-1",
      )
      .catch(() => undefined);

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        status: OrderStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.system,
        cancelReason: ORDER_CANCEL_REASON.oversoldAfterPayment,
      }),
    });
    expect(paymentRefund.processRefund).toHaveBeenCalledWith(
      "order-1",
      300,
      expect.objectContaining({ cancelledBy: CancellationActor.system }),
    );
  });
});
