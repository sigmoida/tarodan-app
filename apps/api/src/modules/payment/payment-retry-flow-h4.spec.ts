import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentStatus } from "@prisma/client";

/**
 * FLOW-H4: retryPayment artık YENİ payment satırı OLUŞTURMAZ (Payment.orderId @unique →
 * P2002/500 verirdi ve retry hiç çalışmazdı). Mevcut `failed` satırı CAS ile `pending`'e
 * resetlenip yeniden kullanılır; merchant_oid rotate edilir.
 */
describe("PaymentLifecycleService.retryPayment — FLOW-H4 row reuse", () => {
  const PAYMENT_ID = "pay-1";
  const USER_ID = "buyer-1";

  const makeService = (
    over: { paymentStatus?: string; casCount?: number } = {},
  ) => {
    const payment = {
      id: PAYMENT_ID,
      status: over.paymentStatus ?? PaymentStatus.failed,
      orderId: "order-1",
      amount: 100,
      currency: "TRY",
      provider: "paytr",
      metadata: { auditHistory: [] },
      order: {
        id: "order-1",
        buyerId: "buyer-1",
        sellerId: "seller-1",
        status: "pending_payment",
        productId: "prod-1",
        orderNumber: "ORD1",
        buyer: {},
        seller: {},
        product: {},
      },
    };
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(payment),
        create: jest.fn().mockResolvedValue({ id: "SHOULD-NOT-BE-CALLED" }),
        updateMany: jest.fn().mockResolvedValue({ count: over.casCount ?? 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const paymentCommon = {
      logPaymentAction: jest.fn().mockResolvedValue(undefined),
      assignMerchantOid: jest.fn().mockResolvedValue("ORD1T123456"),
    };
    const service = new PaymentLifecycleService(
      prisma as any, // prisma
      {} as any, // configService
      {} as any, // paymentProviders
      {} as any, // eventService
      paymentCommon as any, // paymentCommon
      {} as any, // paymentFulfillment
    );
    return { service, prisma, paymentCommon };
  };

  it("başarılı retry: YENİ satır OLUŞTURMAZ, mevcut failed satırı CAS ile pending'e resetler", async () => {
    const { service, prisma, paymentCommon } = makeService();

    const res = await service.retryPayment(PAYMENT_ID, USER_ID);

    // Kritik: payment.create ASLA çağrılmamalı (P2002/500 kaynağı).
    expect(prisma.payment.create).not.toHaveBeenCalled();
    // CAS: failed → pending, status guard'lı.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID, status: PaymentStatus.failed },
      data: { status: PaymentStatus.pending, providerPaymentId: null },
    });
    // merchant_oid rotate (aynı satır id'siyle).
    expect(paymentCommon.assignMerchantOid).toHaveBeenCalledWith(
      PAYMENT_ID,
      "ORD1",
    );
    // Satır yeniden kullanıldığından newPaymentId == paymentId.
    expect(res.newPaymentId).toBe(PAYMENT_ID);
    expect(res.paymentId).toBe(PAYMENT_ID);
  });

  it("CAS yarışı (count=0): başka bir işlem zaten resetlemiş → reddedilir, oid atanmaz", async () => {
    const { service, prisma, paymentCommon } = makeService({ casCount: 0 });

    await expect(service.retryPayment(PAYMENT_ID, USER_ID)).rejects.toThrow();

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(paymentCommon.assignMerchantOid).not.toHaveBeenCalled();
  });

  it("failed olmayan ödeme retry edilemez (CAS'e bile gelmez)", async () => {
    const { service, prisma } = makeService({
      paymentStatus: PaymentStatus.completed,
    });

    await expect(service.retryPayment(PAYMENT_ID, USER_ID)).rejects.toThrow();

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
