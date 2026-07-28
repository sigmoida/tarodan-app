import { DiscountService } from "./discount.service";

describe("DiscountService coupon usage lifecycle", () => {
  const expiresAt = new Date("2026-07-30T00:00:00.000Z");

  function makeService(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "discount-1" }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      discount: {
        findUnique: jest.fn().mockResolvedValue({
          id: "discount-1",
          usedCount: 0,
          usageLimitTotal: 10,
          usageLimitPerUser: 1,
        }),
      },
      discountUsage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "usage-1" }),
      },
      couponReservation: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "reservation-1" }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      discountCode: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ...txOverrides,
    } as any;
    const prisma = {
      $transaction: jest.fn(async (callback: (client: any) => unknown) =>
        callback(tx),
      ),
    } as any;
    return {
      service: new DiscountService(
        prisma,
        { delPattern: jest.fn() } as any,
        { syncProduct: jest.fn() } as any,
      ),
      tx,
    };
  }

  it("reserves capacity at order creation without consuming the coupon", async () => {
    const { service, tx } = makeService();

    await service.reserveUsage(
      "discount-1",
      "buyer-1",
      "order-1",
      25,
      undefined,
      expiresAt,
    );

    expect(tx.couponReservation.create).toHaveBeenCalledWith({
      data: {
        discountId: "discount-1",
        userId: "buyer-1",
        orderId: "order-1",
        amount: expect.anything(),
        voucherCodeId: null,
        expiresAt,
      },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.discountUsage.create).not.toHaveBeenCalled();
  });

  it("consumes a reserved coupon only after successful payment", async () => {
    const reservation = {
      id: "reservation-1",
      discountId: "discount-1",
      userId: "buyer-1",
      orderId: "order-1",
      amount: 25,
      voucherCodeId: null,
    };
    const { service, tx } = makeService({
      couponReservation: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([reservation]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await service.consumeReservedUsageForOrders(["order-1"]);

    expect(tx.couponReservation.updateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", status: "active" },
      data: { status: "consumed", consumedAt: expect.any(Date) },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.discountUsage.create).toHaveBeenCalledWith({
      data: {
        discountId: "discount-1",
        userId: "buyer-1",
        orderId: "order-1",
        amount: expect.anything(),
      },
    });
  });

  it("releases an unpaid reservation without changing real usage", async () => {
    const { service, tx } = makeService();

    await service.releaseReservedUsageForOrders(["order-1"]);

    expect(tx.couponReservation.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: { in: ["order-1"] },
        status: "active",
      },
      data: { status: "released", releasedAt: expect.any(Date) },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.discountUsage.create).not.toHaveBeenCalled();
  });
});
