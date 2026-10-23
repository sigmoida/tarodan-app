import { UserBankService } from "./user-bank.service";

/**
 * K9 contract: payout transfers that failed for a reason the seller fixes
 * (no bank account, invalid IBAN, PayTR rejected the IBAN or holder name)
 * return to pending when the seller saves the bank account; the 15-minute
 * cron takes over with the current details. The "payout failed" e-mail
 * promises exactly this. None of these reached PayTR's oid, so resending is
 * safe. A save that leaves the IBAN and holder name as they were revives
 * only no_bank_account rows: resending the same rejected details would fail
 * again and e-mail the seller again. The IBAN-change cooldown still applies
 * in the cron (not skipped).
 */
describe("UserBankService.upsertBankAccount — payout requeue", () => {
  const makeService = (
    existingIban: string | null,
    existingHolder = "Ayşe Satıcı",
  ) => {
    const prisma = {
      sellerBankAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            existingIban
              ? { iban: existingIban, accountHolder: existingHolder }
              : null,
          ),
        upsert: jest.fn().mockResolvedValue({ id: "acc-1" }),
      },
      payoutTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    return {
      service: new UserBankService(
        prisma as unknown as ConstructorParameters<typeof UserBankService>[0],
      ),
      prisma,
    };
  };

  it("requeues every seller-fixable failed transfer when the account is saved", async () => {
    const { service, prisma } = makeService(null);

    await service.upsertBankAccount("seller-1", {
      accountHolder: "Ayşe Satıcı",
      iban: "TR12 0006 4000 0011 2345 6789 01",
    });

    expect(prisma.payoutTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        sellerId: "seller-1",
        status: "failed",
        failureReason: {
          in: [
            "no_bank_account",
            "invalid_iban_format",
            "bank_details_rejected",
          ],
        },
      },
      data: {
        status: "pending",
        failureReason: null,
        retryCount: 0,
        nextRetryAt: null,
        providerReference: null,
      },
    });
  });

  it("IBAN değişikliğinde cooldown başlar AMA requeue yine yapılır (cron bekletir)", async () => {
    const { service, prisma } = makeService("TR120006400000112345678901");

    await service.upsertBankAccount("seller-1", {
      accountHolder: "Ayşe Satıcı",
      iban: "TR33 0006 4000 0011 2345 6789 99",
    });

    const upsertArgs = prisma.sellerBankAccount.upsert.mock.calls[0][0];
    expect(upsertArgs.update.ibanChangedAt).toBeInstanceOf(Date);
    expect(prisma.payoutTransfer.updateMany).toHaveBeenCalled();
  });

  const requeuedReasons = (prisma: {
    payoutTransfer: { updateMany: jest.Mock };
  }) => prisma.payoutTransfer.updateMany.mock.calls[0][0].where.failureReason;

  it("revives only no_bank_account rows when the IBAN and holder name did not change", async () => {
    const { service, prisma } = makeService("TR120006400000112345678901");

    await service.upsertBankAccount("seller-1", {
      accountHolder: "Ayşe Satıcı",
      iban: "TR12 0006 4000 0011 2345 6789 01",
      taxId: "1234567890",
    });

    expect(requeuedReasons(prisma)).toEqual({ in: ["no_bank_account"] });
  });

  it("revives every seller-fixable row when only the holder name changed", async () => {
    const { service, prisma } = makeService(
      "TR120006400000112345678901",
      "Ayse Satici",
    );

    await service.upsertBankAccount("seller-1", {
      accountHolder: "Ayşe Satıcı",
      iban: "TR12 0006 4000 0011 2345 6789 01",
    });

    expect(requeuedReasons(prisma)).toEqual({
      in: ["no_bank_account", "invalid_iban_format", "bank_details_rejected"],
    });
  });
});
