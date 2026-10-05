import { UserBankService } from "./user-bank.service";

/**
 * Banka hesabındaki TCKN, üyenin yasal kimliğiyle (`User.nationalId`) çelişen
 * ikinci bir kaynak olamaz. Web formu alanı artık göstermiyor; mobil hâlâ
 * gönderebilir — o yüzden sunucu kuralı burada sabitlenir.
 */
describe("UserBankService.upsertBankAccount — TCKN tek kaynak", () => {
  const makeService = (nationalId: string | null) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ nationalId }),
      },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "acc-1" }),
      },
      payoutTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { service: new UserBankService(prisma as never), prisma };
  };

  const base = {
    accountHolder: "Ayşe Yılmaz",
    iban: "TR33 0006 1005 1978 6457 8413 26",
  };

  it("üyenin kayıtlı numarasından FARKLI TCKN'yi reddeder", async () => {
    const { service, prisma } = makeService("10000000146");

    await expect(
      service.upsertBankAccount("u1", { ...base, tcKimlikNo: "12345678950" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.identity.bankNationalIdMismatch" },
    });
    expect(prisma.sellerBankAccount.upsert).not.toHaveBeenCalled();
  });

  it("kayıtlı numarayla AYNI TCKN'yi kabul eder", async () => {
    const { service, prisma } = makeService("10000000146");

    await service.upsertBankAccount("u1", {
      ...base,
      tcKimlikNo: "10000000146",
    });

    const args = prisma.sellerBankAccount.upsert.mock.calls[0][0];
    expect(args.update.tcKimlikNo).toBe("10000000146");
  });

  it("üyenin numarası yokken gönderilen TCKN eskisi gibi saklanır", async () => {
    const { service, prisma } = makeService(null);

    await service.upsertBankAccount("u1", {
      ...base,
      tcKimlikNo: "12345678950",
    });

    const args = prisma.sellerBankAccount.upsert.mock.calls[0][0];
    expect(args.create.tcKimlikNo).toBe("12345678950");
  });

  it("TCKN gönderilmezse mevcut değere DOKUNMAZ (web formu alanı göstermiyor)", async () => {
    const { service, prisma } = makeService("10000000146");

    await service.upsertBankAccount("u1", base);

    const args = prisma.sellerBankAccount.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty("tcKimlikNo");
    expect(args.create.tcKimlikNo).toBeNull();
    // Gönderilmeyen numara için kimlik okunmaz.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
