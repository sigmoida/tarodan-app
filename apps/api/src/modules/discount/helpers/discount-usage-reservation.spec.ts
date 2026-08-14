import { DiscountService } from "../discount.service";

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
      // Otomatik kampanya bütçe iadesi: release, siparişin breakdown'ını okur ve
      // damgayı claim eder; kupon testlerinde breakdown'sız sipariş yeterli.
      order: {
        findMany: jest.fn().mockResolvedValue([]),
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

  it("returns automatic (code-less) campaign budget once, via the order claim stamp", async () => {
    const budget = { releaseBudget: jest.fn(), spendBudget: jest.fn() };
    const breakdown = [
      { discountId: "auto-1", discountCode: null, amount: 30 },
      { discountId: "auto-1", discountCode: null, amount: 20 },
      // Kuponlu satırın bütçesi rezervasyonla döner; buradan DÖNMEZ.
      { discountId: "coupon-1", discountCode: "YAZ10", amount: 15 },
    ];
    const { service, tx } = makeService({
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: "order-1", feeDiscountBreakdown: breakdown },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    (service as any).feeDiscountBudget = budget;

    await service.releaseReservedUsageForOrders(["order-1"]);

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", feeDiscountBudgetReleasedAt: null },
      data: { feeDiscountBudgetReleasedAt: expect.any(Date) },
    });
    expect(budget.releaseBudget).toHaveBeenCalledWith(
      [{ discountId: "auto-1", amount: 50 }],
      tx,
    );
  });

  it("does not double-release budget when the claim was already taken", async () => {
    const budget = { releaseBudget: jest.fn(), spendBudget: jest.fn() };
    const { service } = makeService({
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "order-1",
            feeDiscountBreakdown: [
              { discountId: "auto-1", discountCode: null, amount: 30 },
            ],
          },
        ]),
        // Yarış: başka bir yol damgayı bizden önce almış.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    (service as any).feeDiscountBudget = budget;

    await service.releaseReservedUsageForOrders(["order-1"]);

    // Kupon rezervasyon yolu boş listeyle çağırabilir; damga alınamadığı için
    // otomatik kampanya girdisi HİÇBİR çağrıda olmamalı.
    const releasedEntries = budget.releaseBudget.mock.calls.flatMap(
      ([entries]) => entries as { discountId: string }[],
    );
    expect(releasedEntries).toEqual([]);
  });
});
