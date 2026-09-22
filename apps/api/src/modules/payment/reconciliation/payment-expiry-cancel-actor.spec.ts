import { CancellationActor, OrderStatus } from "@prisma/client";
import { ORDER_CANCEL_REASON } from "../../order/helpers/order-cancel-reasons";
import { PaymentExpiryReconciliationService } from "./payment-expiry-reconciliation.service";

/**
 * 24 saatlik ödeme penceresi dolan sipariş SİSTEM tarafından iptal edilir ve
 * admin ekranının "Süresi Dolan" diye okuduğu sabit gerekçeyi taşır.
 */
describe("PaymentExpiryReconciliationService.expireUnpaidOrders — iptal aktörü", () => {
  it("pencere dolumunu sistem aktörü ve süre dolumu gerekçesiyle yazar", async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest
          .fn()
          // Kilitten sonraki taze okuma, ardından grup kontrolü.
          .mockResolvedValueOnce({
            status: OrderStatus.pending_payment,
            quantity: 1,
          })
          .mockResolvedValue({ checkoutGroupId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      membershipPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      offer: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "o1",
            productId: "p1",
            offerId: null,
            buyerId: "b1",
            orderNumber: "ORD-1",
            // Rezervasyonu 30 dk cron'u zaten bırakmış: stok dalı atlanır.
            reservationReleasedAt: new Date(),
            product: { title: "Ürün" },
          },
        ]),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const notificationService = {
      notifyOrderPaymentExpired: jest.fn().mockResolvedValue(undefined),
      sendOrderCancelledEmails: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentExpiryReconciliationService(
      prisma,
      { del: jest.fn().mockResolvedValue(undefined) } as any, // cache
      {} as any, // configService
      notificationService as any,
      {} as any, // commissionLedger
      {} as any, // paymentRefund
      {} as any, // eventService
      {} as any, // paymentCommon
      {} as any, // paymentFulfillment
      {
        releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
      } as any, // discountService
    );

    await service.expireUnpaidOrders();

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: {
        status: OrderStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.system,
        cancelReason: ORDER_CANCEL_REASON.paymentWindowExpired,
      },
    });
  });
});
