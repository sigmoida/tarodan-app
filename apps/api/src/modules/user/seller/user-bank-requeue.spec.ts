import { UserBankService } from "./user-bank.service";

/**
 * K9 sözleşmesi: IBAN yokken failed(no_bank_account) düşen payout transferleri,
 * satıcı banka hesabını kaydettiği anda pending'e döner (15 dk cron devralır).
 * Admin retry beklemeden para akışı kendiliğinden canlanır; IBAN-değişikliği
 * cooldown'u cron tarafında aynen devrededir (burada atlatılmaz).
 */
describe("UserBankService.upsertBankAccount — payout requeue", () => {
  const makeService = (existingIban: string | null) => {
    const prisma = {
      sellerBankAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue(existingIban ? { iban: existingIban } : null),
        upsert: jest.fn().mockResolvedValue({ id: "acc-1" }),
      },
      payoutTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    return { service: new UserBankService(prisma as any), prisma };
  };

  it("ilk IBAN kaydında no_bank_account transferleri pending'e çekilir", async () => {
    const { service, prisma } = makeService(null);

    await service.upsertBankAccount("seller-1", {
      accountHolder: "Ayşe Satıcı",
      iban: "TR12 0006 4000 0011 2345 6789 01",
    });

    expect(prisma.payoutTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        sellerId: "seller-1",
        status: "failed",
        failureReason: "no_bank_account",
      },
      data: {
        status: "pending",
        failureReason: null,
        retryCount: 0,
        nextRetryAt: null,
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
});
