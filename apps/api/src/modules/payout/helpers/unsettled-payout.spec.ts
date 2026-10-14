import {
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import {
  hasUnsettledPayout,
  purgeSettledBankAccountsOfDeletedSellers,
} from "./unsettled-payout";

/**
 * Silinmiş satıcının banka hesabı yalnız ona ödenecek para kalmadığında
 * silinebilir: payout üretici ve işlemcisi IBAN'ı işlem anında okur. Yüklem
 * üreticinin kurallarıyla (test şeridi, iade denemesi, tam iade) hizalıdır.
 */
describe("hasUnsettledPayout", () => {
  const makeDb = (opts: {
    openTransfers?: number;
    failed?: Array<{
      failureReason: string | null;
      paymentHold: { amount: number; refundedAmount: number } | null;
    }>;
    holds?: Array<{ amount: number; refundedAmount: number }>;
    tradeCash?: Array<{
      tradeId: string;
      payment: { id: string; isTest: boolean } | null;
    }>;
    succeededRefunds?: number;
  }) => ({
    payoutTransfer: {
      count: jest.fn().mockResolvedValue(opts.openTransfers ?? 0),
      findMany: jest.fn().mockResolvedValue(opts.failed ?? []),
    },
    paymentHold: { findMany: jest.fn().mockResolvedValue(opts.holds ?? []) },
    tradeCashPayment: {
      findMany: jest.fn().mockResolvedValue(opts.tradeCash ?? []),
    },
    refundAttempt: {
      count: jest.fn().mockResolvedValue(opts.succeededRefunds ?? 0),
    },
  });

  it("hiçbir kalem yoksa borç yok", async () => {
    await expect(hasUnsettledPayout(makeDb({}) as never, "s1")).resolves.toBe(
      false,
    );
  });

  it("açık payout (kuyrukta / yolda / geri dönmüş) borçtur", async () => {
    const db = makeDb({ openTransfers: 1 });

    await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(true);
    expect(db.payoutTransfer.count).toHaveBeenCalledWith({
      where: {
        sellerId: "s1",
        status: {
          in: [
            PayoutStatus.pending,
            PayoutStatus.processing,
            PayoutStatus.retry_pending,
            PayoutStatus.returned,
          ],
        },
      },
    });
  });

  it("tam iade edilmiş failed payout kalıcıdır, borç sayılmaz", async () => {
    const db = makeDb({
      failed: [
        { failureReason: "fully_refunded", paymentHold: null },
        {
          failureReason: "order_refunded",
          paymentHold: { amount: 100, refundedAmount: 100 },
        },
      ],
    });

    await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(false);
  });

  it.each([
    ["no_bank_account", null],
    ["invalid_iban_format", null],
    ["order_refunded", { amount: 100, refundedAmount: 40 }],
  ])(
    "retry edilebilecek failed payout (%s) borçtur",
    async (failureReason, paymentHold) => {
      const db = makeDb({ failed: [{ failureReason, paymentHold }] });

      await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(true);
    },
  );

  it("payout'u üretilmemiş, test dışı ve tükenmemiş hold borçtur", async () => {
    const db = makeDb({ holds: [{ amount: 100, refundedAmount: 0 }] });

    await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(true);
    expect(db.paymentHold.findMany).toHaveBeenCalledWith({
      where: {
        sellerId: "s1",
        status: { in: [PaymentHoldStatus.held, PaymentHoldStatus.released] },
        payoutTransfer: null,
        payment: { isTest: false },
      },
      select: { amount: true, refundedAmount: true },
    });
  });

  it("tamamen iade edilmiş hold borç değildir", async () => {
    const db = makeDb({ holds: [{ amount: 100, refundedAmount: 100 }] });

    await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(false);
  });

  it("transferi üretilmemiş takas nakit farkı borçtur (test şeridi hariç)", async () => {
    const db = makeDb({
      tradeCash: [{ tradeId: "t1", payment: { id: "p1", isTest: false } }],
    });

    await expect(hasUnsettledPayout(db as never, "s1")).resolves.toBe(true);
    expect(db.tradeCashPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientId: "s1",
          status: PaymentStatus.completed,
          amount: { gt: 0 },
          payoutTransfers: { none: {} },
          trade: { isTest: false },
        },
      }),
    );
    expect(db.refundAttempt.count).toHaveBeenCalledWith({
      where: {
        paymentId: "p1",
        tradeId: "t1",
        status: RefundAttemptStatus.succeeded,
      },
    });
  });

  it("ödeyene iade edilmiş ya da test ödemesi olan takas nakdi borç değildir", async () => {
    const refunded = makeDb({
      tradeCash: [{ tradeId: "t1", payment: { id: "p1", isTest: false } }],
      succeededRefunds: 1,
    });
    const testLane = makeDb({
      tradeCash: [{ tradeId: "t2", payment: { id: "p2", isTest: true } }],
    });

    await expect(hasUnsettledPayout(refunded as never, "s1")).resolves.toBe(
      false,
    );
    await expect(hasUnsettledPayout(testLane as never, "s1")).resolves.toBe(
      false,
    );
  });
});

describe("purgeSettledBankAccountsOfDeletedSellers", () => {
  const makeDb = (
    pages: Array<Array<{ id: string; userId: string }>>,
    debtors: string[] = [],
  ) => {
    const findMany = jest.fn();
    for (const page of pages) findMany.mockResolvedValueOnce(page);
    findMany.mockResolvedValue([]);
    return {
      sellerBankAccount: {
        findMany,
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payoutTransfer: {
        count: jest.fn(({ where }: { where: { sellerId: string } }) =>
          Promise.resolve(debtors.includes(where.sellerId) ? 1 : 0),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentHold: { findMany: jest.fn().mockResolvedValue([]) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      refundAttempt: { count: jest.fn().mockResolvedValue(0) },
    };
  };

  it("yalnız silinmiş hesapların banka satırlarına bakar", async () => {
    const db = makeDb([[]]);

    await purgeSettledBankAccountsOfDeletedSellers(db as never);

    expect(db.sellerBankAccount.findMany).toHaveBeenCalledWith({
      where: { user: { deletedAt: { not: null } } },
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
      take: 200,
    });
  });

  it("borcu kalmayanı siler, borçluyu bir sonraki tura bırakır", async () => {
    const db = makeDb(
      [
        [
          { id: "b1", userId: "u1" },
          { id: "b2", userId: "u2" },
        ],
      ],
      ["u2"],
    );

    await expect(
      purgeSettledBankAccountsOfDeletedSellers(db as never),
    ).resolves.toBe(1);
    expect(db.sellerBankAccount.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.sellerBankAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: "b1" },
    });
  });

  it("dolu sayfadan sonra kaldığı yerden devam eder (borçlular aç bırakmaz)", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: `b${String(i).padStart(3, "0")}`,
      userId: "debtor",
    }));
    const db = makeDb([fullPage, [{ id: "c1", userId: "u9" }]], ["debtor"]);

    await expect(
      purgeSettledBankAccountsOfDeletedSellers(db as never),
    ).resolves.toBe(1);
    expect(db.sellerBankAccount.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          user: { deletedAt: { not: null } },
          id: { gt: "b199" },
        },
      }),
    );
    expect(db.sellerBankAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });
});
