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
    legalFirstName: "Ahmet Can",
    legalLastName: "Yılmaz",
    nationalId: "10000000146",
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

  function makeService(
    overrides: {
      upsert?: jest.Mock;
      listings?: Array<{ id: string; status: string }>;
      /** İşlem İÇİ engel denetiminde görünen açık sipariş (yarış). */
      ordersInTx?: Array<{ id: string; status: string }>;
    } = {},
  ) {
    const listings = overrides.listings ?? [];
    const txEmpty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const tx = {
      // İlan satırı kilidi (SELECT … FOR UPDATE).
      $queryRaw: jest.fn().mockResolvedValue([]),
      // S3: aktif / onay bekleyen ilanlar silme transaction'ında pasife.
      product: {
        // Rezerve-ilan engel sorgusu boş; pasifleştirme okumaları ilanları görür.
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where?.status?.in?.length === 1 && where.status.in[0] === "reserved"
              ? []
              : listings,
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // İşlem içi engel denetimi.
      trade: txEmpty(),
      order: {
        findMany: jest.fn().mockResolvedValue(overrides.ordersInTx ?? []),
      },
      refundRequest: txEmpty(),
      payoutTransfer: txEmpty(),
      paymentHold: txEmpty(),
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
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

    const search = { syncProduct: jest.fn().mockResolvedValue(undefined) };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UserProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { recordMarketingChange: jest.fn() } as never, // consents
      { syncUserConsent: jest.fn() } as never, // newsletter
      search as never,
      cache as never,
    );
    return { service, prisma, tx, search, cache };
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

  it("silme öncesi gerçek kimliği saklar; TCKN'de üyenin beyanı banka hesabından önce gelir", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const { create } = tx.deletedUserIdentity.upsert.mock.calls[0][0];
    expect(create.email).toBe("ahmet@example.com");
    expect(create.username).toBe("ahmet");
    expect(create.displayName).toBe("Ahmet Yılmaz");
    expect(create.legalFirstName).toBe("Ahmet Can");
    expect(create.legalLastName).toBe("Yılmaz");
    expect(create.nationalId).toBe("10000000146");
    expect(create.sourceDetail.nationalId).toBe("user");
    expect(create.taxId).toBe("1234567890");
    expect(create.addressCity).toBe("İstanbul");
    expect(create.wasSeller).toBe(true);
    expect(create.deletedByActor).toBe("self");
    expect(create.source).toBe("live");
  });

  it("üyenin beyanı yoksa banka hesabındaki TCKN'yi saklar (eski hesap)", async () => {
    const { service, tx } = makeService();
    tx.user.findUnique.mockResolvedValueOnce({
      ...user,
      legalFirstName: null,
      legalLastName: null,
      nationalId: null,
    });

    await service.deleteAccount("user-1");

    const { create } = tx.deletedUserIdentity.upsert.mock.calls[0][0];
    expect(create.nationalId).toBe("12345678901");
    expect(create.sourceDetail.nationalId).toBe("seller_bank_account");
    expect(create.legalFirstName).toBeNull();
  });

  it("yasal kimliği arşivden SONRA canlı satırda NULL'lar (TCKN serbest kalır)", async () => {
    const { service, tx } = makeService();

    await service.deleteAccount("user-1");

    const { data } = tx.user.update.mock.calls[0][0];
    expect(data.legalFirstName).toBeNull();
    expect(data.legalLastName).toBeNull();
    expect(data.nationalId).toBeNull();
    expect(
      tx.deletedUserIdentity.upsert.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.user.update.mock.invocationCallOrder[0]);
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

  describe("aktif ilanlar (S3 — Apple 5.1.1(v))", () => {
    const listings = [
      { id: "p-active", status: "active" },
      { id: "p-pending", status: "pending" },
    ];

    it("ilanlar anonimleştirmeyle AYNI transaction'da, arşivden sonra pasife alınır", async () => {
      const { service, tx } = makeService({ listings });

      await service.deleteAccount("user-1");

      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "inactive" } }),
      );
      const deactivateOrder = tx.product.updateMany.mock.invocationCallOrder[0];
      expect(
        tx.deletedUserIdentity.upsert.mock.invocationCallOrder[0],
      ).toBeLessThan(deactivateOrder);
      expect(deactivateOrder).toBeLessThan(
        tx.user.update.mock.invocationCallOrder[0],
      );
    });

    it("commit sonrası arama dizini ve önbellek senkronlanır", async () => {
      const { service, search, cache } = makeService({ listings });

      await service.deleteAccount("user-1");

      expect(search.syncProduct).toHaveBeenCalledWith("p-active");
      expect(search.syncProduct).toHaveBeenCalledWith("p-pending");
      expect(cache.delPattern).toHaveBeenCalledWith("products:list:*");
      expect(cache.del).toHaveBeenCalledWith("products:detail:p-active");
    });

    it("ilan yoksa senkron çağrısı yapılmaz", async () => {
      const { service, search, cache } = makeService();

      await service.deleteAccount("user-1");

      expect(search.syncProduct).not.toHaveBeenCalled();
      expect(cache.delPattern).not.toHaveBeenCalled();
    });

    it("senkron hatası silmeyi başarısız göstermez (hesap zaten silindi)", async () => {
      const { service, search, cache } = makeService({ listings });
      cache.delPattern.mockRejectedValue(new Error("redis down"));
      search.syncProduct.mockRejectedValue(new Error("es down"));

      await expect(service.deleteAccount("user-1")).resolves.toBeUndefined();
    });

    it("silme transaction'ı düşerse senkron yapılmaz", async () => {
      const upsert = jest.fn().mockRejectedValue(new Error("db down"));
      const { service, search } = makeService({ upsert, listings });

      await expect(service.deleteAccount("user-1")).rejects.toBeDefined();
      expect(search.syncProduct).not.toHaveBeenCalled();
    });
  });

  // P1 inceleme (TOCTOU): dış denetimden sonra başlayan bir checkout, ilanlar
  // kilitlenip pasife alındıktan sonraki işlem içi denetimde görünür.
  describe("işlem içi engel denetimi", () => {
    it("pasifleştirmeden SONRA, anonimleştirmeden ÖNCE yeniden denetler", async () => {
      const { service, tx } = makeService({
        listings: [{ id: "p-active", status: "active" }],
      });

      await service.deleteAccount("user-1");

      const statusUpdate = tx.product.updateMany.mock.invocationCallOrder[0];
      const blockerCheck = tx.order.findMany.mock.invocationCallOrder[0];
      expect(statusUpdate).toBeLessThan(blockerCheck);
      expect(blockerCheck).toBeLessThan(
        tx.user.update.mock.invocationCallOrder[0],
      );
    });

    it("arada açılmış sipariş → aynı engel yanıtı, hesap anonimleşmez", async () => {
      const { service, tx, search } = makeService({
        listings: [{ id: "p-active", status: "active" }],
        ordersInTx: [{ id: "o1", status: "pending_payment" }],
      });

      const error = await service
        .deleteAccount("user-1")
        .catch((e: unknown) => e as { getResponse(): any });

      const body = error.getResponse();
      expect(body.i18nKey).toBe("server.user.deleteAccountBlocked");
      expect(body.details.pendingOrders).toBe(1);
      expect(tx.user.update).not.toHaveBeenCalled();
      // İşlem geri alındı: commit sonrası senkron da yok.
      expect(search.syncProduct).not.toHaveBeenCalled();
    });
  });
});
