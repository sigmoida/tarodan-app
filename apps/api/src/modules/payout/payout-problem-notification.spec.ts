import { PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * Satıcı, payout'u aktarılamadığında HABER ALMALI. Eskiden yalnız başarıda
 * ("ödemeniz aktarıldı") mail vardı; returned/failed sadece log + admin
 * ekranında kalıyordu — satıcı parasının gelmediğini kendisi keşfediyordu.
 *
 *  - Banka transferi geri döndüğünde (kullanım dışı IBAN): payout-returned-seller.
 *  - Kalıcı başarısızlıkta (maxRetries doldu / geçersiz IBAN / hesap yok):
 *    payout-failed-seller.
 *  - Geçici hata (retry_pending) mail ATMAZ — her denemede spam olmasın.
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
    tradeCashPayment: null,
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
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        if (where.status && where.status !== state.status) {
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
  transferResult?: { status: string; err_msg?: string };
  returnedTransfers?: { status: string; data?: any[] };
}) {
  const createPlatformTransfer = jest
    .fn()
    .mockResolvedValue(opts.transferResult ?? { status: "success" });
  const getReturnedTransfers = jest
    .fn()
    .mockResolvedValue(
      opts.returnedTransfers ?? { status: "success", data: [] },
    );
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
    const payout = makePayout({ status: PayoutStatus.completed });
    const prisma = makePrisma(payout, activeAccount);
    const { service, notification } = makeService({
      prisma,
      returnedTransfers: {
        status: "success",
        data: [{ trans_id: "TRANSFER1", reason: "hesap kapalı" }],
      },
    });

    const updated = await service.checkReturnedTransfers();

    expect(updated).toBe(1);
    expect(prisma.state.status).toBe(PayoutStatus.returned);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-returned-seller",
      expect.objectContaining({ payoutAmount: 90 }),
    );
  });

  it("emails the seller on PERMANENT provider failure (maxRetries doldu)", async () => {
    const payout = makePayout({ retryCount: 0, maxRetries: 1 });
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

  it("does NOT email on a transient failure that will be retried", async () => {
    const payout = makePayout({ retryCount: 0, maxRetries: 3 });
    const prisma = makePrisma(payout, activeAccount);
    const { service, notification } = makeService({
      prisma,
      transferResult: { status: "failed", err_msg: "timeout" },
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
