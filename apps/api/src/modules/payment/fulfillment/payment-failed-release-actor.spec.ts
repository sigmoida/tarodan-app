import { CancellationActor, OrderStatus } from "@prisma/client";
import { ORDER_CANCEL_REASON } from "../../order/helpers/order-cancel-reasons";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

/**
 * Başarısız ödeme siparişi kapatırken aktörü ve (varsa) gerekçeyi ÇAĞIRAN
 * söyler: alıcının ödemeyi iptal etmesi `buyer`, sağlayıcı reddi `system`,
 * ödeme penceresinin dolması `system` + "Süresi Dolan" gerekçesi. Gerekçe
 * verilmezse `cancelReason` yazılmaz (eski davranış).
 */
describe("PaymentFulfillmentService.releaseProductForFailedPayment — iptal kaydı", () => {
  const makeService = () => {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          status: OrderStatus.pending_payment,
          productId: "p1",
          offerId: null,
          quantity: 1,
          reservationReleasedAt: null,
        }),
        update: jest.fn((arg: unknown) => arg),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: 5,
          reservedQuantity: 1,
          title: "Ürün",
          status: "active",
        }),
        update: jest.fn((arg: unknown) => arg),
      },
      offer: { update: jest.fn((arg: unknown) => arg) },
      membershipPayment: { updateMany: jest.fn((arg: unknown) => arg) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const svc = Object.create(PaymentFulfillmentService.prototype);
    Object.assign(svc, {
      prisma,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      cache: { del: jest.fn().mockResolvedValue(undefined) },
      discountService: {
        releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
      },
      fulfillmentNotifier: {
        dispatchBackInStock: jest.fn().mockResolvedValue(undefined),
      },
    });
    return { service: svc as PaymentFulfillmentService, prisma };
  };

  it("alıcının ödeme iptali: aktör alıcı, gerekçe yazılmaz", async () => {
    const { service, prisma } = makeService();

    await service.releaseProductForFailedPayment("o1", {
      by: CancellationActor.buyer,
    });

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        status: OrderStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.buyer,
      }),
    );
    expect(data).not.toHaveProperty("cancelReason");
  });

  it("ödeme penceresi doldu: aktör sistem, süre dolumu gerekçesi", async () => {
    const { service, prisma } = makeService();

    await service.releaseProductForFailedPayment("o1", {
      by: CancellationActor.system,
      reason: ORDER_CANCEL_REASON.paymentWindowExpired,
    });

    expect(prisma.order.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        cancelledBy: CancellationActor.system,
        cancelReason: ORDER_CANCEL_REASON.paymentWindowExpired,
      }),
    );
  });
});
