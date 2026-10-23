import { PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * The seller must hear about a payout that did not reach them. There used to
 * be an e-mail only on success; returned/failed stayed in logs and the admin
 * screen, and sellers found out on their own.
 *
 *  - Transfer bounced by the bank (closed IBAN): payout-returned-seller.
 *  - Final failure the seller can fix (PayTR rejected the bank details,
 *    invalid IBAN, no bank account): payout-failed-seller.
 *  - A failure that will be retried (PayTR err_no 010) sends nothing, so the
 *    seller is not spammed on every attempt. Platform-side failures are the
 *    team's (payout-transfer-retry-policy.spec.ts).
 */

const VALID_IBAN = "TR330006100519786457841326";

function makePayout(overrides: Record<string, unknown> = {}) {
  return {
    id: "payout-1",
    sellerId: "seller-1",
    merchantOid: "ORDER1",
    transId: "TRANSFER1",
    amount: 100,
    netAmount: 90,
    transferIban: VALID_IBAN,
    transferName: "Seller",
    status: PayoutStatus.pending,
    paymentHold: null,
    // A paid source: the transfer total is capped against its payment.
    tradeCashPayment: {
      tradeId: "trade-1",
      paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      totalAmount: 100,
      payment: { id: "pay-1", amount: 100, metadata: null },
    },
    submittedAt: null,
    submittedAmount: null,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

function makePrisma(payout: any, account: any) {
  const state: { status: PayoutStatus; data: Record<string, unknown> } = {
    status: payout.status,
    data: {},
  };
  const apply = (data: Record<string, unknown>) => {
    if (data.status) state.status = data.status as PayoutStatus;
    Object.assign(state.data, data);
  };
  return {
    state,
    payoutTransfer: {
      findMany: jest.fn().mockResolvedValue([payout]),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.transId === payout.transId || where.id === payout.id
              ? { ...payout, ...state.data, status: state.status }
              : null,
          ),
        ),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.providerReference &&
              where.providerReference === payout.providerReference
              ? { ...payout, ...state.data, status: state.status }
              : null,
          ),
        ),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const allowed = where.status?.in
          ? where.status.in.includes(state.status)
          : !where.status || where.status === state.status;
        if (!allowed) {
          return Promise.resolve({ count: 0 });
        }
        apply(data);
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn().mockImplementation(({ data }: any) => {
        apply(data);
        return Promise.resolve({});
      }),
    },
    refundAttempt: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    sellerBankAccount: {
      findUnique: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ displayName: "Satıcı" }),
    },
  };
}

function makeService(opts: {
  prisma: any;
  transferResult?: { status: string; err_no?: string; err_msg?: string };
  returnedTransfers?: any[];
}) {
  const createPlatformTransfer = jest
    .fn()
    .mockResolvedValue(opts.transferResult ?? { status: "success" });
  const getReturnedTransfers = jest
    .fn()
    .mockResolvedValue(opts.returnedTransfers ?? []);
  const notification = { sendTemplateEmailToUser: jest.fn() };
  const service = new PayoutService(
    opts.prisma,
    {
      resolve: () => ({ createPlatformTransfer, getReturnedTransfers }),
    } as any,
    { get: jest.fn().mockReturnValue(undefined) } as any,
    notification as any,
    { record: jest.fn() } as any,
  );
  return { service, notification };
}

const activeAccount = {
  userId: "seller-1",
  iban: VALID_IBAN,
  accountHolder: "Seller",
  ibanChangedAt: null,
  isVerified: true,
};

describe("payout problem notifications", () => {
  it("emails the seller when a completed transfer is returned by the bank", async () => {
    const payout = makePayout({
      status: PayoutStatus.completed,
      providerReference: "PAYTRREF1",
    });
    const prisma = makePrisma(payout, activeAccount);
    const { service, notification } = makeService({
      prisma,
      returnedTransfers: [
        {
          refNo: "PAYTRREF1",
          dateDetected: "2026-08-03",
          dateReimbursed: "2026-08-02",
          transferName: "Seller",
          transferIban: VALID_IBAN,
          transferAmount: 90,
          transferCurrency: "TL",
          transferDate: "2026-08-01",
          raw: {},
        },
      ],
    });

    const updated = await service.checkReturnedTransfers();

    expect(updated).toEqual({ returned: 1, unmatched: 0 });
    expect(prisma.state.status).toBe(PayoutStatus.returned);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-returned-seller",
      expect.objectContaining({ payoutAmount: 90 }),
    );
  });

  it("emails the seller when PayTR rejects the bank details (final at once)", async () => {
    const payout = makePayout({ retryCount: 0, maxRetries: 3 });
    const prisma = makePrisma(payout, activeAccount);
    const { service, notification } = makeService({
      prisma,
      transferResult: { status: "failed", err_msg: "IBAN gecersiz" },
    });

    await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.failed);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-failed-seller",
      expect.objectContaining({ payoutAmount: 90 }),
    );
  });

  it("does NOT email on a failure that will be retried (PayTR err_no 010)", async () => {
    const payout = makePayout({ retryCount: 0, maxRetries: 3 });
    const prisma = makePrisma(payout, activeAccount);
    const { service, notification } = makeService({
      prisma,
      transferResult: {
        status: "error",
        err_no: "010",
        err_msg: "toplam transfer tutarı kalan tutardan fazla olamaz",
      },
    });

    await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.retry_pending);
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("emails the seller when the IBAN fails the pre-transfer checksum", async () => {
    const payout = makePayout();
    const badAccount = {
      ...activeAccount,
      iban: "TR330006100519786457841327",
    };
    const prisma = makePrisma(payout, badAccount);
    const { service, notification } = makeService({ prisma });

    await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.failed);
    expect(prisma.state.data.failureReason).toBe("invalid_iban_format");
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-failed-seller",
      expect.anything(),
    );
  });

  it("emails the seller when there is no bank account at transfer time", async () => {
    const payout = makePayout();
    const prisma = makePrisma(payout, null);
    const { service, notification } = makeService({ prisma });

    await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.failed);
    expect(prisma.state.data.failureReason).toBe("no_bank_account");
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-failed-seller",
      expect.anything(),
    );
  });
});
