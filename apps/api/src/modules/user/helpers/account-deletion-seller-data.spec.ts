import { PaymentStatus, PayoutStatus } from "@prisma/client";
import { purgeSellerDataForAccountDeletion } from "./account-deletion-seller-data";

/**
 * Hesap silme (KVKK): IBAN/TCKN/hesap sahibi ve kurumsal başvurunun iletişim
 * alanları canlı tablolarda kalmaz — ama hesaba ödenecek para varken banka
 * hesabı silinmez, aksi hâlde hakediş ödenemez.
 */
describe("purgeSellerDataForAccountDeletion", () => {
  const makeTx = (opts: {
    openTransfers?: number;
    unpaidTradeCash?: number;
  }) => ({
    payoutTransfer: {
      count: jest.fn().mockResolvedValue(opts.openTransfers ?? 0),
    },
    tradeCashPayment: {
      count: jest.fn().mockResolvedValue(opts.unpaidTradeCash ?? 0),
    },
    sellerBankAccount: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    corporateApplication: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  it("ödenecek para yoksa banka hesabını siler", async () => {
    const tx = makeTx({});

    await expect(
      purgeSellerDataForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual({ bankAccountRetained: false });
    expect(tx.sellerBankAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("tamamlanmamış payout varken banka hesabını korur", async () => {
    const tx = makeTx({ openTransfers: 1 });

    await expect(
      purgeSellerDataForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual({ bankAccountRetained: true });
    expect(tx.sellerBankAccount.deleteMany).not.toHaveBeenCalled();
    expect(tx.payoutTransfer.count).toHaveBeenCalledWith({
      where: { sellerId: "user-1", status: { not: PayoutStatus.completed } },
    });
  });

  it("transferi üretilmemiş takas nakit farkı varken banka hesabını korur", async () => {
    const tx = makeTx({ unpaidTradeCash: 1 });

    await expect(
      purgeSellerDataForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual({ bankAccountRetained: true });
    expect(tx.sellerBankAccount.deleteMany).not.toHaveBeenCalled();
    expect(tx.tradeCashPayment.count).toHaveBeenCalledWith({
      where: {
        recipientId: "user-1",
        status: PaymentStatus.completed,
        amount: { gt: 0 },
        payoutTransfers: { none: {} },
      },
    });
  });

  it("kurumsal başvuruyu silmez; yalnız iletişim ve banka alanlarını temizler", async () => {
    const tx = makeTx({});

    await purgeSellerDataForAccountDeletion(tx as never, "user-1");

    const { where, data } = tx.corporateApplication.updateMany.mock.calls[0][0];
    expect(where).toEqual({ userId: "user-1" });
    expect(data).toEqual({
      phone: "",
      companyEmail: "deleted_user-1@deleted.local",
      contactPhone: null,
      kepAddress: null,
      iban: null,
      bankAccountHolder: null,
    });
    // Arşivin tam taşımadığı kimlik alanlarına dokunulmaz.
    expect(data).not.toHaveProperty("authorizedFullName");
    expect(data).not.toHaveProperty("stakeholders");
  });
});
