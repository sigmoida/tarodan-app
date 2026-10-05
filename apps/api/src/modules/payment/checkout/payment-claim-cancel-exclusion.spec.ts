import { BadRequestException } from "@nestjs/common";
import { OrderOrigin, OrderStatus } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * ÇEKİM ↔ İPTAL DIŞLAMASI (claim tarafı). Alıcı ödeme formunu gönderdiğinde
 * sipariş düz okumayla `pending_payment` görünür; mesafeli satış kapısı ve
 * PayTR durum sorgusu sürerken yönetici siparişi iptal edebilir. Claim bu
 * aralığı kapatmak için ödeme satırını, sonra siparişleri kilitleyip
 * siparişin HÂLÂ ödenebilir olduğunu claim'le AYNI işlemde doğrular; aksi
 * halde PayTR iptal edilmiş siparişi çekerdi (taraflara "ödeme alınmadı"
 * denmişken).
 */
describe("PaymentInitiationService — claim iptal edilmiş siparişte başlamaz", () => {
  const order = {
    id: "order-1",
    orderNumber: "ORD-10001",
    buyerId: "buyer-1",
    productId: "product-1",
    origin: OrderOrigin.offer,
    checkoutGroupId: null,
    status: OrderStatus.pending_payment,
    paymentExpiresAt: null,
    reservationReleasedAt: null,
    totalAmount: 250,
    shippingAddress: { fullName: "Alıcı Kişi", city: "İstanbul" },
    buyer: { id: "buyer-1", displayName: "Alıcı Kişi", email: "b@test.local" },
    product: { id: "product-1", title: "Model araba" },
  };

  /** `lockedStatus`: kilit altında okunan (o anki commit edilmiş) durum. */
  const makeService = (lockedStatus: OrderStatus) => {
    const calls: string[] = [];
    const prisma: any = {
      // Düz ön okuma: hâlâ ödenebilir görünüyor.
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          orderId: "order-1",
          checkoutGroupId: null,
          status: "pending",
          providerConversationId: null,
          metadata: null,
        }),
        updateMany: jest.fn().mockImplementation(() => {
          calls.push("claim");
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "pay-1", metadata: null }),
      },
      $queryRaw: jest.fn().mockImplementation((sql: TemplateStringsArray) => {
        const text = sql.join("?");
        if (text.includes("FROM payments")) {
          calls.push("lock:payment");
          return Promise.resolve([{ id: "pay-1" }]);
        }
        calls.push("lock:orders");
        return Promise.resolve([{ status: lockedStatus }]);
      }),
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => {
      calls.push("tx");
      return fn(prisma);
    });
    const service = new PaymentInitiationService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { ensureForPayment: jest.fn().mockResolvedValue("record") } as never,
    );
    return { service, prisma, calls };
  };

  const resolve = (service: PaymentInitiationService) =>
    (service as any).resolveDirectPaymentContext("buyer-1", {
      orderId: "order-1",
      distanceSalesAccepted: true,
    });

  it("sipariş hâlâ ödenebilirse: işlem içinde ödeme → sipariş kilidi, sonra claim", async () => {
    const { service, calls } = makeService(OrderStatus.pending_payment);

    await resolve(service);

    expect(calls).toEqual(["tx", "lock:payment", "lock:orders", "claim"]);
  });

  it.each([OrderStatus.cancelled, OrderStatus.preparing])(
    "ön okumadan sonra sipariş %s olduysa claim yazılmaz, çekim başlamaz",
    async (status) => {
      const { service, prisma } = makeService(status);

      const attempt = resolve(service);

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toMatchObject({
        response: { i18nKey: "server.payment.orderNotAwaitingPayment" },
      });
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    },
  );
});
