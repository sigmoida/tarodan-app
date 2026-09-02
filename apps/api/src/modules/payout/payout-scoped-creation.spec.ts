import { PayoutService } from "./payout.service";
import { PaymentHoldStatus, PaymentStatus } from "@prisma/client";

/**
 * createPayoutsForReleasedHolds `scope` sözleşmesi.
 *
 * Admin manuel release fast-path'i bu metodu TEK sipariş/takas için çağırır.
 * Kapsam daraltması iki şeyi garanti etmeli:
 *  1. Verilen kimlik sorgu filtresine girer (sınırsız tarama + ilgisiz hold
 *     başına iade-guard sorgusu yapılmaz),
 *  2. Karşı bölüm HİÇ sorgulanmaz (order release'i takas tablosuna, takas
 *     release'i hold tablosuna dokunmaz).
 * Scope'suz çağrı (saatlik cron süpürmesi) eski davranışın birebir aynısıdır —
 * regresyon guard'ı olarak sabitlenir.
 */
describe("PayoutService.createPayoutsForReleasedHolds — scope", () => {
  const makeService = () => {
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PayoutService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  };

  it("scope.orderId: hold taraması orderId ile daralır, takas bölümü atlanır", async () => {
    const { service, prisma } = makeService();

    await service.createPayoutsForReleasedHolds({ orderId: "o-1" });

    expect(prisma.paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PaymentHoldStatus.released,
          payoutTransfer: null,
          frozenByRefundId: null,
          orderId: "o-1",
        }),
      }),
    );
    expect(prisma.tradeCashPayment.findMany).not.toHaveBeenCalled();
  });

  it("scope.tradeId: takas taraması tradeId ile daralır, hold bölümü atlanır", async () => {
    const { service, prisma } = makeService();

    await service.createPayoutsForReleasedHolds({ tradeId: "t-1" });

    expect(prisma.paymentHold.findMany).not.toHaveBeenCalled();
    expect(prisma.tradeCashPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PaymentStatus.completed,
          releasedAt: { not: null },
          payoutTransfers: { none: {} },
          tradeId: "t-1",
        }),
      }),
    );
  });

  it("scope'suz çağrı iki bölümü de eski filtrelerle tarar (cron regresyon guard'ı)", async () => {
    const { service, prisma } = makeService();

    await service.createPayoutsForReleasedHolds();

    expect(prisma.paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PaymentHoldStatus.released,
          payoutTransfer: null,
          frozenByRefundId: null,
        },
      }),
    );
    expect(prisma.tradeCashPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PaymentStatus.completed,
          releasedAt: { not: null },
          payoutTransfers: { none: {} },
          recipientId: { not: null },
          amount: { gt: 0 },
        },
      }),
    );
  });
});
