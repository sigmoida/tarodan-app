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

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(persistedStatus).toBe(PayoutStatus.pending);
  });
});
