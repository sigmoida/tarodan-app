import { OrderStatus, PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * PayTR: "Sipariş ödemesi ile aynı gün transfer talebi oluşturamazsınız."
 * Aynı gün gönderilen talimat reddedilir; ~5 saatlik retry penceresi gün
 * dönmeden tükenir ve payout kalıcı failed olurdu (admin manuel release
 * senaryosu). Bugün (Europe/Istanbul) ödenen payout pending bekler, retry
 * sayacı yanmaz; dün ödenen normal gider.
 */
describe("PayoutService.processPendingPayouts same-day guard", () => {
  const VALID_IBAN = "TR330006100519786457841326";

  const makeService = (payout: any) => {
    const updates: any[] = [];
    let persistedStatus: PayoutStatus = payout.status;
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([payout]),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ where, data });
          if (where.status && where.status !== persistedStatus) {
            return Promise.resolve({ count: 0 });
          }
          if (data.status) persistedStatus = data.status;
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          updates.push({ data });
          if (data.status) persistedStatus = data.status;
          return Promise.resolve({});
        }),
        findUnique: jest.fn().mockResolvedValue(payout),
        count: jest.fn().mockResolvedValue(0),
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
          userId: payout.sellerId,
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
    return {
      service,
      createPlatformTransfer,
      updates,
      status: () => persistedStatus,
    };
  };

  const basePayout = (paidAt: Date) => ({
    id: "p1",
    sellerId: "s1",
    status: PayoutStatus.pending,
    netAmount: 88,
    amount: 100,
    commission: 12,
    merchantOid: "OID1",
    transId: "PYTK7X9M2QF3N",
    transferIban: VALID_IBAN,
    transferName: "Satici",
    retryCount: 0,
    maxRetries: 3,
    paymentHold: {
      paymentId: "pay1",
      orderId: "o1",
      amount: 88,
      refundedAmount: 0,
      payment: { paidAt, createdAt: paidAt },
    },
    tradeCashPayment: null,
  });

  it("leaves a payout paid today pending without calling PayTR, regardless of process TZ", async () => {
    const previous = process.env.TZ;
    try {
      for (const tz of ["UTC", "Europe/Istanbul", "America/New_York"]) {
        process.env.TZ = tz;
        const { service, createPlatformTransfer, updates, status } =
          makeService(basePayout(new Date()));

        const result = await service.processPendingPayouts();

        expect(result).toEqual({ processed: 0, submitted: 0, failed: 0 });
        expect(createPlatformTransfer).not.toHaveBeenCalled();
        expect(status()).toBe(PayoutStatus.pending);
        // Retry sayacı / nextRetryAt / failureReason'a dokunulmaz.
        expect(
          updates.some(
            (u) =>
              u.data?.retryCount !== undefined ||
              u.data?.nextRetryAt !== undefined ||
              u.data?.failureReason,
          ),
        ).toBe(false);
      }
    } finally {
      process.env.TZ = previous;
    }
  });

  it("submits a payout whose payment completed on an earlier day", async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const { service, createPlatformTransfer } = makeService(
      basePayout(twoDaysAgo),
    );

    const result = await service.processPendingPayouts();

    expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
    expect(createPlatformTransfer.mock.calls[0][0].transId).toBe(
      "PYTK7X9M2QF3N",
    );
    expect(result.processed + result.submitted).toBe(1);
  });

  it("uses the trade cash payment's own paidAt for trade payouts", async () => {
    const payout = {
      ...basePayout(new Date()),
      paymentHold: null,
      tradeCashPayment: {
        tradeId: "t1",
        paidAt: new Date(),
        payment: { id: "pay-t1" },
      },
    };
    const { service, createPlatformTransfer, status } = makeService(payout);

    await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(status()).toBe(PayoutStatus.pending);
  });
});
