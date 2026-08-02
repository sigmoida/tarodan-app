import { OrderStatus, PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

describe("PayoutService seller adjustment deductions", () => {
  const makeService = (debt: number) => {
    let created: any;
    const hold = {
      id: "hold-1",
      orderId: "order-1",
      amount: 100,
      refundedAmount: 0,
      sellerId: "seller-1",
      paymentId: "payment-1",
      payment: { providerConversationId: "OID-1" },
      seller: {
        bankAccount: { iban: "TR0001", accountHolder: "Seller" },
      },
    };
    const order = {
      id: "order-1",
      orderNumber: "B-1001",
      status: OrderStatus.completed,
      totalAmount: 120,
      commissionAmount: 20,
      withholdingTaxAmount: 0,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payoutTransfer: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => {
          created = { id: "payout-1", ...data };
          return Promise.resolve(created);
        }),
      },
      sellerAccountAdjustment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "adjustment-1",
            remainingAmount: debt,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      sellerAdjustmentApplication: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      sellerAccountAdjustment: {
        findFirst: jest.fn().mockResolvedValue({ id: "adjustment-1" }),
      },
      payoutTransfer: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new PayoutService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma, tx, getCreated: () => created };
  };

  it("carries unpaid debt forward when an adjustment consumes the whole payout", async () => {
    const { service, tx, getCreated } = makeService(180);

    expect(await service.createPayoutsForReleasedHolds()).toBe(1);

    expect(getCreated()).toMatchObject({
      netAmount: 0,
      adjustmentDeduction: 100,
      status: PayoutStatus.completed,
    });
    expect(tx.sellerAccountAdjustment.update).toHaveBeenCalledWith({
      where: { id: "adjustment-1" },
      data: {
        remainingAmount: 80,
        status: "open",
        settledAt: null,
      },
    });
  });

  it("settles a smaller debt and sends only the remaining payout", async () => {
    const { service, tx, getCreated } = makeService(30);

    await service.createPayoutsForReleasedHolds();

    expect(getCreated()).toMatchObject({
      netAmount: 70,
      adjustmentDeduction: 30,
      status: PayoutStatus.pending,
    });
    expect(tx.sellerAccountAdjustment.update).toHaveBeenCalledWith({
      where: { id: "adjustment-1" },
      data: expect.objectContaining({
        remainingAmount: 0,
        status: "settled",
      }),
    });
  });
});
