import { UserBankService } from "./user-bank.service";

/**
 * Banka hesabındaki TCKN, üyenin yasal kimliğiyle (`User.nationalId`) çelişen
 * ikinci bir kaynak olamaz. Web formu alanı artık göstermiyor; mobil hâlâ
 * gönderebilir — üstelik formunu GET yanıtıyla doldurup kayıtlı değeri aynen
 * geri yollar. Kural: gönderilmeyen (null/boş dahil) ya da kayıtlı değerin
 * aynısı olan numaraya dokunulmaz; yalnız YENİ değer doğrulanır.
 */
describe("UserBankService.upsertBankAccount — TCKN tek kaynak", () => {
  const makeService = (opts: {
    nationalId?: string | null;
    storedTckn?: string | null;
  }) => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nationalId: opts.nationalId ?? null }),
      },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue(
          opts.storedTckn === undefined
            ? null
            : {
                iban: "TR330006100519786457841326",
                tcKimlikNo: opts.storedTckn,
              },
        ),
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
  const upsertArgs = (prisma: ReturnType<typeof makeService>["prisma"]) =>
    prisma.sellerBankAccount.upsert.mock.calls[0][0];

  describe("yeni değer", () => {
    it("üyenin kayıtlı numarasından FARKLI TCKN'yi reddeder", async () => {
      const { service, prisma } = makeService({ nationalId: "10000000146" });

      await expect(
        service.upsertBankAccount("u1", {
          ...base,
          tcKimlikNo: "12345678950",
        }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.identity.bankNationalIdMismatch" },
      });
      expect(prisma.sellerBankAccount.upsert).not.toHaveBeenCalled();
    });

    it("checksum'ı tutmayan YENİ TCKN'yi reddeder", async () => {
      const { service, prisma } = makeService({});

      await expect(
        service.upsertBankAccount("u1", {
          ...base,
          tcKimlikNo: "12345678901",
        }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.identity.nationalIdInvalid" },
      });
      expect(prisma.sellerBankAccount.upsert).not.toHaveBeenCalled();
    });

    it("kayıtlı numarayla AYNI TCKN'yi kabul eder", async () => {
      const { service, prisma } = makeService({ nationalId: "10000000146" });

      await service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: "10000000146",
      });

      expect(upsertArgs(prisma).update.tcKimlikNo).toBe("10000000146");
    });

    it("üyenin numarası yokken geçerli TCKN eskisi gibi saklanır", async () => {
      const { service, prisma } = makeService({});

      await service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: "12345678950",
      });

      expect(upsertArgs(prisma).create.tcKimlikNo).toBe("12345678950");
    });
  });

  describe("kayıtlı değerin geri gönderilmesi (mobil formu GET ile doldurur)", () => {
    it("bugünkü checksum kuralına uymayan ESKİ değer IBAN güncellemesini engellemez", async () => {
      const { service, prisma } = makeService({ storedTckn: "12345678901" });

      await service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: "12345678901",
      });

      const args = upsertArgs(prisma);
      expect(args.update).not.toHaveProperty("tcKimlikNo");
      expect(args.update.iban).toBe("TR330006100519786457841326");
    });

    it("üyenin beyanından FARKLI eski değer de engellemez (yalnız yeni değer karşılaştırılır)", async () => {
      const { service, prisma } = makeService({
        nationalId: "10000000146",
        storedTckn: "12345678950",
      });

      await service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: "123 456 789 50",
      });

      expect(upsertArgs(prisma).update).not.toHaveProperty("tcKimlikNo");
      // Kimlik okunmaz bile: eski değerin yankısı bir kimlik beyanı değildir.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("gönderilmeyen değer", () => {
    it("alan yoksa mevcut değere DOKUNMAZ (web formu alanı göstermiyor)", async () => {
      const { service, prisma } = makeService({
        nationalId: "10000000146",
        storedTckn: "10000000146",
      });

      await service.upsertBankAccount("u1", base);

      expect(upsertArgs(prisma).update).not.toHaveProperty("tcKimlikNo");
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("null 'gönderilmedi' sayılır: 400 yok, kolona boş metin yazılmaz", async () => {
      const withNumber = makeService({ nationalId: "10000000146" });
      await withNumber.service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: null,
      });
      expect(upsertArgs(withNumber.prisma).update).not.toHaveProperty(
        "tcKimlikNo",
      );
      expect(upsertArgs(withNumber.prisma).create.tcKimlikNo).toBeNull();

      const withoutNumber = makeService({});
      await withoutNumber.service.upsertBankAccount("u1", {
        ...base,
        tcKimlikNo: "  ",
      });
      expect(upsertArgs(withoutNumber.prisma).create.tcKimlikNo).toBeNull();
    });
  });
});
