import { UserProfileService } from "./user-profile.service";
import { ANONYMIZED_DISPLAY_NAME } from "../../../common/helpers/deleted-user-identity";

/**
 * Hesap silme, kimliği geri dönülemez şekilde anonimleştiriyor. Yasal aylık
 * bildirim için kimlik ARŞİVE kopyalanmadan hiçbir şey yok edilmemeli — bu
 * spec o sırayı ve fail-closed davranışı sabitler.
 */
describe("UserProfileService.deleteAccount kimlik arşivi", () => {
  const user = {
    id: "user-1",
    email: "ahmet@example.com",
    username: "ahmet",
    displayName: "Ahmet Yılmaz",
    phone: "+905551112233",
    birthDate: null,
    taxId: "1234567890",
    taxOffice: "Kadıköy",
    companyName: "Yılmaz Ltd.",
    companyType: "limited",
    companyCity: "İstanbul",
    companyDistrict: "Kadıköy",
    sellerType: null,
    businessStatus: null,
    isSeller: true,
    adminCode: "B10001",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    deletedAt: null,
  };

  function makeService(overrides: { upsert?: jest.Mock } = {}) {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          fullName: "Ahmet Yılmaz",
          phone: "+905551112233",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Örnek Mah. 1",
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue({
          tcKimlikNo: "12345678901",
          taxId: null,
          iban: "TR000000000000000000000000",
          accountHolder: "Ahmet Yılmaz",
        }),
      },
      corporateApplication: { findUnique: jest.fn().mockResolvedValue(null) },
      deletedUserIdentity: {
        upsert: overrides.upsert ?? jest.fn().mockResolvedValue({}),
      },
      refreshToken: { deleteMany: jest.fn() },
      passwordResetToken: { deleteMany: jest.fn() },
      emailVerificationToken: { deleteMany: jest.fn() },
      pushToken: { deleteMany: jest.fn() },
      oAuthAccount: { deleteMany: jest.fn() },
      twoFactorSecret: { deleteMany: jest.fn() },
      savedCard: { deleteMany: jest.fn() },
      notificationLog: { deleteMany: jest.fn() },
      newsletterSubscriber: { updateMany: jest.fn() },
    };

    const empty = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      product: empty,
      trade: empty,
      order: empty,
      refundRequest: empty,
      payoutTransfer: empty,
      paymentHold: empty,
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    };

    const service = new UserProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, tx };
  }

  it("arşivi, adresler silinmeden ve satır anonimleştirilmeden ÖNCE yazar", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const upsertOrder =
      tx.deletedUserIdentity.upsert.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(
      tx.address.deleteMany.mock.invocationCallOrder[0],
    );
    expect(upsertOrder).toBeLessThan(
      tx.user.update.mock.invocationCallOrder[0],
    );
  });

  it("silme öncesi gerçek kimliği ve banka hesabındaki TCKN'yi saklar", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const { create } = tx.deletedUserIdentity.upsert.mock.calls[0][0];
    expect(create.email).toBe("ahmet@example.com");
    expect(create.username).toBe("ahmet");
    expect(create.displayName).toBe("Ahmet Yılmaz");
    expect(create.nationalId).toBe("12345678901");
    expect(create.taxId).toBe("1234567890");
    expect(create.addressCity).toBe("İstanbul");
    expect(create.wasSeller).toBe(true);
    expect(create.deletedByActor).toBe("self");
    expect(create.source).toBe("live");
    expect(create.sourceDetail.nationalId).toBe("seller_bank_account");
  });

  it("saklama bitişini silme tarihine 10 yıl ekleyerek yazar", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const { create } = tx.deletedUserIdentity.upsert.mock.calls[0][0];
    expect(
      create.retainUntil.getUTCFullYear() - create.deletedAt.getUTCFullYear(),
    ).toBe(10);
  });

  it("update dalı BOŞ: ikinci çağrı iyi arşivi anonim veriyle ezemez", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    expect(tx.deletedUserIdentity.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("yönetici silmesini arşive damgalar", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1", {
      actor: "admin",
      adminUserId: "admin-9",
    });

    const { create } = tx.deletedUserIdentity.upsert.mock.calls[0][0];
    expect(create.deletedByActor).toBe("admin");
    expect(create.deletedByAdminUserId).toBe("admin-9");
  });

  it("arşiv yazılamazsa hesabı ANONİMLEŞTİRMEZ (fail-closed)", async () => {
    const upsert = jest.fn().mockRejectedValue(new Error("db down"));
    const { service, tx } = makeService({ upsert });

    await expect(service.deleteAccount("user-1")).rejects.toMatchObject({
      response: { i18nKey: "server.user.deleteAccountFailed" },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.address.deleteMany).not.toHaveBeenCalled();
  });

  it("anonimleştirme sentinel'leri tek kaynaktan gelir", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const { data } = tx.user.update.mock.calls[0][0];
    expect(data.email).toBe("deleted_user-1@deleted.local");
    expect(data.displayName).toBe(ANONYMIZED_DISPLAY_NAME);
  });
});
