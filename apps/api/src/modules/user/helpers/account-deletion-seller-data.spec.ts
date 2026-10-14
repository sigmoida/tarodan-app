import { purgeSellerDataForAccountDeletion } from "./account-deletion-seller-data";
import { hasUnsettledPayout } from "../../payout/helpers/unsettled-payout";

jest.mock("../../payout/helpers/unsettled-payout", () => ({
  hasUnsettledPayout: jest.fn(),
}));

/**
 * Hesap silme (KVKK): IBAN/TCKN/hesap sahibi ve kurumsal başvurunun iletişim
 * alanları canlı tablolarda kalmaz — ama hesaba ödenecek para varken banka
 * hesabı silinmez, aksi hâlde hakediş ödenemez. "Ödenecek para" kuralı payout
 * modülünün tek yüklemidir (`hasUnsettledPayout`, kendi spec'inde).
 */
describe("purgeSellerDataForAccountDeletion", () => {
  const unsettled = hasUnsettledPayout as jest.MockedFunction<
    typeof hasUnsettledPayout
  >;
  const makeTx = () => ({
    sellerBankAccount: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    corporateApplication: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  beforeEach(() => unsettled.mockReset());

  it("ödenecek para yoksa banka hesabını siler", async () => {
    unsettled.mockResolvedValue(false);
    const tx = makeTx();

    await expect(
      purgeSellerDataForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual({ bankAccountRetained: false });
    expect(unsettled).toHaveBeenCalledWith(tx, "user-1");
    expect(tx.sellerBankAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("ödenecek para varken banka hesabını korur", async () => {
    unsettled.mockResolvedValue(true);
    const tx = makeTx();

    await expect(
      purgeSellerDataForAccountDeletion(tx as never, "user-1"),
    ).resolves.toEqual({ bankAccountRetained: true });
    expect(tx.sellerBankAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("kurumsal başvuruyu silmez; yalnız iletişim ve banka alanlarını temizler", async () => {
    unsettled.mockResolvedValue(false);
    const tx = makeTx();

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
