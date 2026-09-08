import { PayoutService } from "./payout.service";

/**
 * Test şeridi siparişleri PayTR test modunda ödenir: tahsil edilen para yoktur.
 * Released hold görülse bile satıcıya transfer satırı ÜRETİLMEZ; skip, iade
 * guard'ından (refundRequest sorgusu) önce gelir.
 */
describe("PayoutService.createPayoutsForReleasedHolds — test lane", () => {
  const makeService = (
    hold: Record<string, unknown>,
    order: Record<string, unknown>,
  ) => {
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
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

  it("skips a released hold whose payment is in the test lane", async () => {
    const { service, prisma } = makeService(
      {
        id: "h-1",
        orderId: "o-1",
        paymentId: "p-1",
        payment: { id: "p-1", isTest: true },
        seller: { bankAccount: { iban: "TR1" } },
      },
      { id: "o-1", status: "delivered", isTest: true, orderNumber: "ORD-1" },
    );

    const created = await service.createPayoutsForReleasedHolds({
      orderId: "o-1",
    });

    expect(created).toBe(0);
    expect(prisma.refundRequest.findFirst).not.toHaveBeenCalled();
    expect(prisma.payoutTransfer.create).not.toHaveBeenCalled();
  });

  it("skips a released trade cash payment whose trade is in the test lane", async () => {
    const { service, prisma } = makeService({}, {});
    prisma.paymentHold.findMany.mockResolvedValue([]);
    prisma.tradeCashPayment.findMany.mockResolvedValue([
      {
        id: "tcp-1",
        tradeId: "t-1",
        amount: 100,
        trade: { id: "t-1", isTest: true },
        payment: { id: "p-2", isTest: true },
      },
    ]);

    const created = await service.createPayoutsForReleasedHolds({
      tradeId: "t-1",
    });

    expect(created).toBe(0);
    expect(prisma.payoutTransfer.create).not.toHaveBeenCalled();
  });
});
