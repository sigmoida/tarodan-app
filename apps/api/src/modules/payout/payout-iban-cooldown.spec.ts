import { PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

describe("PayoutService.processPendingPayouts IBAN cooldown", () => {
  it("keeps a recently changed IBAN payout retryable without calling the provider", async () => {
    const payout = {
      id: "payout-1",
      sellerId: "seller-1",
      merchantOid: "ORDER1",
      transId: "TRANSFER1",
      amount: 100,
      netAmount: 88,
      transferIban: "TR330006100519786457841326",
      transferName: "Seller",
      status: PayoutStatus.pending,
      paymentHold: null,
      tradeCashPayment: null,
    };
    let persistedStatus: PayoutStatus = PayoutStatus.pending;

    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([payout]),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          if (where.status !== persistedStatus) {
            return Promise.resolve({ count: 0 });
          }
          persistedStatus = data.status;
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.status) persistedStatus = data.status;
          return Promise.resolve({});
        }),
      },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue({
          userId: payout.sellerId,
          iban: payout.transferIban,
          accountHolder: payout.transferName,
          ibanChangedAt: new Date(Date.now() - 60_000),
        }),
      },
    };
    const createPlatformTransfer = jest.fn();
    const service = new PayoutService(
      prisma as any,
      {
        resolve: () => ({ createPlatformTransfer }),
      } as any,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as any,
      {} as any,
    );

    const result = await service.processPendingPayouts();

    expect(result).toEqual({ processed: 0, submitted: 0, failed: 0 });
    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(persistedStatus).toBe(PayoutStatus.pending);
  });

  it("releases the claim when the IBAN changes between preflight and transfer", async () => {
    const payout = {
      id: "payout-2",
      sellerId: "seller-2",
      merchantOid: "ORDER2",
      transId: "TRANSFER2",
      amount: 100,
      netAmount: 88,
      transferIban: "TR330006100519786457841326",
      transferName: "Seller",
      status: PayoutStatus.pending,
      paymentHold: null,
      // A paid source: the transfer total is capped against its payment
      // before the claim, so a payout without one never reaches the claim.
      tradeCashPayment: {
        tradeId: "trade-2",
        paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        totalAmount: 100,
        payment: { id: "pay-2", amount: 100, metadata: null },
      },
    };
    let persistedStatus: PayoutStatus = PayoutStatus.pending;
    const updateMany = jest.fn().mockImplementation(({ where, data }) => {
      if (where.status !== persistedStatus) {
        return Promise.resolve({ count: 0 });
      }
      persistedStatus = data.status;
      return Promise.resolve({ count: 1 });
    });
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([payout]),
        updateMany,
        update: jest.fn().mockResolvedValue({}),
      },
      refundAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sellerBankAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            userId: payout.sellerId,
            iban: payout.transferIban,
            accountHolder: payout.transferName,
            ibanChangedAt: null,
          })
          .mockResolvedValueOnce({
            userId: payout.sellerId,
            iban: payout.transferIban,
            accountHolder: payout.transferName,
            ibanChangedAt: new Date(),
          }),
      },
    };
    const createPlatformTransfer = jest.fn();
    const service = new PayoutService(
      prisma as any,
      {
        resolve: () => ({ createPlatformTransfer }),
      } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
      {} as any,
    );

    const result = await service.processPendingPayouts();

    expect(result).toEqual({ processed: 0, submitted: 0, failed: 0 });
    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(persistedStatus).toBe(PayoutStatus.pending);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: payout.id, status: PayoutStatus.processing },
        data: expect.objectContaining({ status: PayoutStatus.pending }),
      }),
    );
  });
});
