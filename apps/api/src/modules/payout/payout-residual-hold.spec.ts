import { PayoutService } from "./payout.service";
import { OrderStatus, PayoutStatus } from "@prisma/client";

/**
 * İade/iptalle KAPANMIŞ siparişin hold kalıntısı (satıcının kargo payı
 * tazmini): kusur satıcıda değilse payout'u oluşturulur ve transfer edilir,
 * satıcıdaysa asla. Eskiden payout yolları yalnız teslim edilmiş siparişi
 * kabul ettiğinden bu tutar escrow'da süresiz kalıyordu.
 */
describe("PayoutService — residual hold on a closed order", () => {
  const cancelledOrder = {
    id: "o1",
    orderNumber: "ORD1",
    status: OrderStatus.cancelled,
    totalAmount: 500,
    commissionAmount: 40,
    withholdingTaxAmount: 0,
  };
  // hold 420, iade 395 tüketti → satıcıya kalan 25 (kargo payı)
  const residualHold = {
    id: "hold-1",
    orderId: "o1",
    paymentId: "pay-1",
    amount: 420,
    refundedAmount: 395,
    sellerId: "s1",
    payment: { providerConversationId: "OID1" },
    seller: { bankAccount: { iban: "TR..", accountHolder: "S" } },
  };

  const makeService = (finalizedRefunds: unknown[]) => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([residualHold]) },
      order: { findMany: jest.fn().mockResolvedValue([cancelledOrder]) },
      refundRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue(finalizedRefunds),
      },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation((arg: { data: never }) => {
          created.push(arg.data);
          return Promise.resolve({});
        }),
      },
    };
    const service = new PayoutService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, created, prisma };
  };

  it("pays the residual (amount − refundedAmount) when the buyer was at fault", async () => {
    const { service, created } = makeService([
      { faultParty: "buyer", policyCode: "v2_buyer_cancellation" },
    ]);

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(1);
    expect(Number(created[0].netAmount)).toBe(25);
    expect(created[0].paymentHoldId).toBe("hold-1");
  });

  it("pays the residual on a platform/carrier-fault closure too", async () => {
    const { service, created } = makeService([
      { faultParty: "platform", policyCode: "v2_platform_cancellation" },
    ]);

    await service.createPayoutsForReleasedHolds();

    expect(Number(created[0].netAmount)).toBe(25);
  });

  it.each([
    ["the seller was at fault", [{ faultParty: "seller", policyCode: "v2_seller_x" }]],
    [
      "a legacy seller-fault policy closed it",
      [{ faultParty: null, policyCode: "seller_fault_cancellation" }],
    ],
    ["no finalized refund establishes the fault", []],
  ])("never pays the residual when %s", async (_name, finalized) => {
    const { service, created } = makeService(finalized);

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(0);
    expect(created).toHaveLength(0);
  });

  it("fails a pending transfer for a seller-fault closure instead of sending it", async () => {
    const updates: Array<{ data: { status: string; failureReason: string } }> =
      [];
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            status: PayoutStatus.pending,
            netAmount: 25,
            paymentHold: {
              paymentId: "pay-1",
              orderId: "o1",
              amount: 420,
              refundedAmount: 395,
            },
          },
        ]),
        updateMany: jest.fn().mockImplementation((arg: never) => {
          updates.push(arg);
          return Promise.resolve({ count: 1 });
        }),
      },
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: OrderStatus.cancelled }),
      },
      refundRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ faultParty: "seller", policyCode: "v2_x" }]),
      },
    };
    const service = new PayoutService(
      prisma as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
    );

    await service.processPendingPayouts();

    expect(updates[0].data).toEqual({
      status: PayoutStatus.failed,
      failureReason: "order_not_payout_eligible",
    });
  });
});
