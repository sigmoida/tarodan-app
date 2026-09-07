import { OrderStatus, PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * Üretimdeki eski `PYT-…` satırları (2026-08-31 / 09-02 kalıcı failed) admin
 * retry ile pending'e döner; retry mevcut transId'yi korur. İşleme anında
 * TEK noktada tiresiz yeniden üretilir ve aynı turda PayTR'ye o id gider.
 */
describe("PayoutService.processPendingPayouts legacy trans_id heal", () => {
  const VALID_IBAN = "TR330006100519786457841326";
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const build = (initialStatus: PayoutStatus) => {
    const payout = {
      id: "p-legacy",
      sellerId: "s1",
      status: initialStatus,
      netAmount: 88,
      amount: 100,
      commission: 12,
      merchantOid: "OID1",
      transId: "PYT-ANR6NFJYBJ",
      transferIban: VALID_IBAN,
      transferName: "Satici",
      retryCount: 0,
      maxRetries: 3,
      paymentHold: {
        paymentId: "pay1",
        orderId: "o1",
        amount: 88,
        refundedAmount: 0,
        payment: { paidAt: threeDaysAgo, createdAt: threeDaysAgo },
      },
      tradeCashPayment: null,
    };
    let persistedStatus = initialStatus;
    const transIdUpdates: any[] = [];
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([payout]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          if (where.status && where.status !== persistedStatus) {
            return Promise.resolve({ count: 0 });
          }
          if (data.transId) transIdUpdates.push({ where, data });
          if (data.status) persistedStatus = data.status;
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.status) persistedStatus = data.status;
          return Promise.resolve({});
        }),
        findUnique: jest.fn().mockResolvedValue(payout),
      },
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "o1", status: OrderStatus.completed }),
        update: jest.fn().mockResolvedValue({}),
      },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "s1",
          iban: VALID_IBAN,
          accountHolder: "Satici",
          ibanChangedAt: null,
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: "S" }) },
    };
    const createPlatformTransfer = jest
      .fn()
      .mockResolvedValue({ status: "success" });
    const service = new PayoutService(
      prisma as any,
      { resolve: () => ({ createPlatformTransfer }) } as any,
      { get: () => undefined } as any,
      {
        sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
    return { service, createPlatformTransfer, transIdUpdates, payout };
  };

  it("rewrites a hyphenated trans_id before the claim and sends the new one to PayTR", async () => {
    const { service, createPlatformTransfer, transIdUpdates } = build(
      PayoutStatus.pending,
    );

    await service.processPendingPayouts();

    expect(transIdUpdates).toHaveLength(1);
    expect(transIdUpdates[0].where).toEqual({
      id: "p-legacy",
      status: PayoutStatus.pending,
    });
    const healed = transIdUpdates[0].data.transId as string;
    expect(healed).toMatch(/^PYT[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
    expect(createPlatformTransfer.mock.calls[0][0].transId).toBe(healed);
  });

  it("does not touch a row that was claimed by another worker meanwhile", async () => {
    const { service, createPlatformTransfer, transIdUpdates } = build(
      PayoutStatus.processing,
    );

    await service.processPendingPayouts();

    // updateMany where{status: pending} → count 0 → atlanır.
    expect(transIdUpdates).toHaveLength(0);
    expect(createPlatformTransfer).not.toHaveBeenCalled();
  });
});
