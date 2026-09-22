import { CancellationActor, OrderStatus, PaymentStatus } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { PaymentRefundService } from "./payment-refund.service";

/**
 * Grup (sepet) ödemesinde sipariş iade tavanı processRefund'da TEK yerde
 * (groupOrderRefundLimit) hesaplanır ve PayTR'ye gitmeden önce uygulanır.
 *
 * Sepet: aynı satıcıdan iki kalem tek kolide. Kolinin alıcı kargo payı (130)
 * yalnız ilk kaleme (A) yazılı: A = 1000 + 130 = 1130, B = 500. Ödeme 1630.
 * A daha önce kardeşi B hâlâ giderken iptal edildi → kargo tutuldu, 1000
 * iade edildi. Şimdi B paketin SON canlı kalemi: v2 hesabı kargoyu B'nin
 * iadesine ekler → 500 + 130 = 630.
 */
describe("PaymentRefundService.processRefund — grup ödemesi iade tavanı", () => {
  const PAST_LIMIT = new Error("past-limit");

  const makeService = (opts: {
    refundedOrders?: Record<string, number>;
    siblings?: Array<{
      id: string;
      status: OrderStatus;
      totalAmount: number;
      buyerShippingAmount: number;
      serviceVatRate?: number;
    }>;
    packageId?: string | null;
    target?: { id: string; totalAmount: number };
  }) => {
    const target = opts.target ?? { id: "order-b", totalAmount: 500 };
    const prisma = {
      payment: {
        // Siparişe bağlı ödeme yok (grup) → ödeme grup üzerinden çözülür.
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { orderId?: string } }) =>
            Promise.resolve(
              where.orderId
                ? null
                : {
                    id: "pay-1",
                    orderId: null,
                    checkoutGroupId: "group-1",
                    amount: 1630,
                    provider: "paytr",
                    status: PaymentStatus.completed,
                    providerConversationId: "OID-1",
                    metadata: { refundedOrders: opts.refundedOrders ?? {} },
                    order: null,
                  },
            ),
          ),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: target.id,
          orderNumber: "ORD-B",
          totalAmount: target.totalAmount,
          checkoutGroupId: "group-1",
          packageId: opts.packageId === undefined ? "pkg-1" : opts.packageId,
        }),
        findMany: jest.fn().mockResolvedValue(
          (opts.siblings ?? []).map((sibling) => ({
            serviceVatRate: 0,
            ...sibling,
          })),
        ),
      },
      refundAttempt: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const attempts = {
      // Tavanı geçen çağrı buraya ulaşır; test burada durdurur.
      claimRefundAttempt: jest.fn().mockRejectedValue(PAST_LIMIT),
    };
    const service = new PaymentRefundService(
      prisma as any,
      { get: jest.fn() } as any,
      { resolve: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      attempts as any,
      {} as any,
    );
    return { service, prisma, attempts };
  };

  const refund = (
    service: PaymentRefundService,
    amount: number,
    id = "order-b",
  ) =>
    service.processRefund(id, amount, {
      idempotencyKey: "refund-request:rr-1",
      cancelledBy: CancellationActor.platform,
    });

  const siblingA = (overrides: Record<string, unknown> = {}) => ({
    id: "order-a",
    status: OrderStatus.cancelled,
    totalAmount: 1130,
    buyerShippingAmount: 130,
    ...overrides,
  });

  it("son canlı kardeş (kargo payı kendisinde değil) pay + kapanan kargoyu iade edebilir", async () => {
    const { service, attempts, prisma } = makeService({
      refundedOrders: { "order-a": 1000 },
      siblings: [siblingA()],
    });

    await expect(refund(service, 630)).rejects.toBe(PAST_LIMIT);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { packageId: "pkg-1", id: { not: "order-b" } },
      }),
    );
    expect(attempts.claimRefundAttempt).toHaveBeenCalledTimes(1);
  });

  it("kapanan kargodan fazlasını reddeder (PayTR'ye gitmeden)", async () => {
    const { service, attempts } = makeService({
      refundedOrders: { "order-a": 1000 },
      siblings: [siblingA()],
    });

    await expect(refund(service, 630.02)).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    expect(attempts.claimRefundAttempt).not.toHaveBeenCalled();
  });

  it("kardeş hâlâ gidecekse koli kargosu bu iadeye eklenemez", async () => {
    const { service, attempts } = makeService({
      siblings: [siblingA({ status: OrderStatus.preparing })],
    });

    await expect(refund(service, 630)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(attempts.claimRefundAttempt).not.toHaveBeenCalled();
    // Kendi payı her zaman geçer.
    await expect(refund(service, 500)).rejects.toBe(PAST_LIMIT);
  });

  it("kargo payını taşıyan ilk kalem kendi tutarıyla sınırlıdır", async () => {
    const { service, attempts } = makeService({
      target: { id: "order-a", totalAmount: 1130 },
      siblings: [
        {
          id: "order-b",
          status: OrderStatus.cancelled,
          totalAmount: 500,
          buyerShippingAmount: 0,
        },
      ],
      refundedOrders: { "order-b": 500 },
    });

    await expect(refund(service, 1130, "order-a")).rejects.toBe(PAST_LIMIT);
    expect(attempts.claimRefundAttempt).toHaveBeenCalledTimes(1);
    await expect(refund(service, 1130.02, "order-a")).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
  });

  it("kargo kardeşte zaten iade edildiyse (A tam iade) ikinci kez iade edilemez", async () => {
    const { service, attempts } = makeService({
      refundedOrders: { "order-a": 1130 },
      siblings: [siblingA()],
    });

    await expect(refund(service, 630)).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    expect(attempts.claimRefundAttempt).not.toHaveBeenCalled();
  });

  it("paketsiz (eski) siparişte ek kargo payı yoktur", async () => {
    const { service, prisma } = makeService({
      packageId: null,
      refundedOrders: { "order-a": 1000 },
    });

    await expect(refund(service, 630)).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
