import { PaymentQueryService } from "./payment-query.service";

/**
 * The payment status tells the web result page which purchase it shows: a
 * membership payment has `isMembershipOrder`, a boost payment `isBoostOrder`
 * and the boost (listing and end), an order of goods neither. Additive: no
 * existing field changes.
 */
describe("PaymentQueryService — virtual order fields", () => {
  const BUYER = "seller-1";

  const makeService = (opts: {
    productId: string;
    boost?: Record<string, unknown> | null;
  }) => {
    const payment = {
      id: "pay-1",
      orderId: "order-1",
      status: "completed",
      amount: 59,
      currency: "TRY",
      provider: "paytr",
      providerPaymentId: null,
      providerConversationId: "BSTK7X9M2QF3N",
      createdAt: new Date("2026-10-21T10:00:00Z"),
      updatedAt: new Date("2026-10-21T10:01:00Z"),
      order: {
        buyerId: BUYER,
        sellerId: "platform",
        productId: opts.productId,
        totalAmount: 59,
        shippingCost: 0,
        buyerFeeAmount: 0,
        sellerFeeAmount: 0,
        commissionAmount: 0,
      },
      checkoutGroup: null,
      tradeCashPayment: null,
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      productBoost: {
        findUnique: jest.fn().mockResolvedValue(opts.boost ?? null),
      },
    };
    const service = new PaymentQueryService(
      prisma as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  };

  const activeBoost = {
    id: "b1",
    productId: "listing-1",
    endsAt: new Date("2026-10-28T10:01:00Z"),
    product: { title: "Model car" },
  };

  describe.each([
    [
      "GET /payments/:id/status",
      (s: PaymentQueryService) => s.getPaymentStatusUnified("pay-1", BUYER),
    ],
    [
      "GET /payments/:id",
      (s: PaymentQueryService) => s.findOne("pay-1", BUYER),
    ],
  ])("%s", (_route, read) => {
    it("flags a boost payment and returns its boost", async () => {
      const { service, prisma } = makeService({
        productId: "boost-b1",
        boost: activeBoost,
      });

      const result = await read(service);

      expect(result).toMatchObject({
        id: "pay-1",
        orderId: "order-1",
        amount: 59,
        isBoostOrder: true,
        boost: {
          id: "b1",
          productId: "listing-1",
          productTitle: "Model car",
          endsAt: "2026-10-28T10:01:00.000Z",
        },
      });
      expect(result).not.toHaveProperty("isMembershipOrder");
      expect(prisma.productBoost.findUnique).toHaveBeenCalledWith({
        where: { orderId: "order-1" },
        select: {
          id: true,
          productId: true,
          endsAt: true,
          product: { select: { title: true } },
        },
      });
    });

    it("returns a null end while the boost is not active yet", async () => {
      const { service } = makeService({
        productId: "boost-b1",
        boost: { ...activeBoost, endsAt: null },
      });

      const result = await read(service);

      expect(result).toMatchObject({
        isBoostOrder: true,
        boost: { id: "b1", endsAt: null },
      });
    });

    it("keeps the flag with a null boost when the boost row is missing", async () => {
      const { service } = makeService({ productId: "boost-b1", boost: null });

      await expect(read(service)).resolves.toMatchObject({
        isBoostOrder: true,
        boost: null,
      });
    });

    it("flags a membership payment and reads no boost", async () => {
      const { service, prisma } = makeService({
        productId: "membership-tier-1",
      });

      const result = await read(service);

      expect(result).toMatchObject({ isMembershipOrder: true });
      expect(result).not.toHaveProperty("isBoostOrder");
      expect(result).not.toHaveProperty("boost");
      expect(prisma.productBoost.findUnique).not.toHaveBeenCalled();
    });

    it("adds nothing to an order of goods", async () => {
      const { service, prisma } = makeService({ productId: "listing-9" });

      const result = await read(service);

      expect(result).not.toHaveProperty("isMembershipOrder");
      expect(result).not.toHaveProperty("isBoostOrder");
      expect(result).not.toHaveProperty("boost");
      expect(prisma.productBoost.findUnique).not.toHaveBeenCalled();
    });
  });

  it("still refuses a stranger before reading the boost", async () => {
    const { service, prisma } = makeService({
      productId: "boost-b1",
      boost: activeBoost,
    });

    await expect(
      service.getPaymentStatusUnified("pay-1", "someone-else"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.findOne("pay-1", "someone-else"),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.productBoost.findUnique).not.toHaveBeenCalled();
  });
});
