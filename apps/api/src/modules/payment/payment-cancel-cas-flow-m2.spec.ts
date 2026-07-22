import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentStatus } from "@prisma/client";

/**
 * FLOW-M2: cancelPayment artık CAS (updateMany + status guard) ile `failed` yapar.
 * findUnique ile update arasında bir başarı callback'i ödemeyi `completed` yaparsa
 * koşulsuz `update` bunu `failed`'a ezip ödenmiş siparişi iptal eder + parayı askıya
 * alırdı. CAS count===0 → iptal etme, ürünü serbest BIRAKMA.
 */
describe("PaymentLifecycleService.cancelPayment — FLOW-M2 CAS", () => {
  const PAYMENT_ID = "pay-1";
  const USER_ID = "buyer-1";

  const makeService = (casCount: number) => {
    const payment = {
      id: PAYMENT_ID,
      status: PaymentStatus.pending,
      orderId: "order-1",
      amount: 100,
      provider: "paytr",
      checkoutGroupId: null,
      order: {
        id: "order-1",
        orderNumber: "ORD1",
        buyerId: "buyer-1",
        sellerId: "seller-1",
        buyer: { id: "buyer-1", email: "b@x", displayName: "B" },
        seller: { id: "seller-1", email: "s@x", displayName: "S" },
      },
    };
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: casCount }),
      },
    };
    const paymentFulfillment = {
      releaseProductForFailedPayment: jest.fn().mockResolvedValue(undefined),
    };
    const paymentCommon = {
      logPaymentAction: jest.fn().mockResolvedValue(undefined),
    };
    const eventService = {
      emitPaymentFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentLifecycleService(
      prisma as any,
      {} as any, // configService
      {} as any, // paymentProviders
      eventService as any,
      paymentCommon as any,
      paymentFulfillment as any,
    );
    return { service, prisma, paymentFulfillment };
  };

  it("CAS başarılı (count=1): ödemeyi failed yapar ve ürünü serbest bırakır", async () => {
    const { service, prisma, paymentFulfillment } = makeService(1);

    const res = await service.cancelPayment(PAYMENT_ID, USER_ID);

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID, status: PaymentStatus.pending },
      data: expect.objectContaining({ status: PaymentStatus.failed }),
    });
    // KOŞULSUZ update kullanılMAMALI (completed'ı ezme riski).
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(
      paymentFulfillment.releaseProductForFailedPayment,
    ).toHaveBeenCalledWith("order-1");
    expect(res.success).toBe(true);
  });

  it("CAS yarışı (count=0, arada tamamlandı): reddeder, ürünü SERBEST BIRAKMAZ", async () => {
    const { service, paymentFulfillment } = makeService(0);

    await expect(service.cancelPayment(PAYMENT_ID, USER_ID)).rejects.toThrow();

    expect(
      paymentFulfillment.releaseProductForFailedPayment,
    ).not.toHaveBeenCalled();
  });
});
