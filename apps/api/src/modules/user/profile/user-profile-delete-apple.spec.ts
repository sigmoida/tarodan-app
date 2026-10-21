import { UserProfileService } from "./user-profile.service";
import { ACCOUNT_DELETION_TX_TIMEOUT_MS } from "../helpers/account-deletion.constants";

/**
 * App Store 5.1.1(v) — Sign in with Apple ile açılmış hesap silinince Apple
 * token'ı iptal edilmeli. İptal işi silme transaction'ında outbox'a yazılır
 * (AppleTokenService.requestRevocation); Apple çağrısı commit sonrasıdır, bu
 * yüzden Apple'a ulaşılamaması silmeyi ENGELLEMEZ.
 */
describe("UserProfileService.deleteAccount — Apple token iptali", () => {
  const user = {
    id: "user-1",
    email: "a@privaterelay.appleid.com",
    username: "a",
    displayName: "A",
    legalFirstName: null,
    legalLastName: null,
    nationalId: null,
    phone: null,
    birthDate: null,
    taxId: null,
    taxOffice: null,
    companyName: null,
    companyType: null,
    companyCity: null,
    companyDistrict: null,
    sellerType: null,
    businessStatus: null,
    isSeller: false,
    adminCode: "U10001",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    deletedAt: null,
    acceptsMarketingEmails: false,
  };

  const makeService = (appleTokens?: { requestRevocation: jest.Mock }) => {
    const txEmpty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const tx = {
      // Kullanıcı satırı kilidi + ilan satırı kilidi (SELECT … FOR UPDATE).
      $queryRaw: jest.fn().mockResolvedValue([]),
      // Hesap silme adımları: ilan pasifleştirme, alıcı teklifleri, işlem içi
      // engel denetimi — hepsi boş (Apple dışı bir yan etki yok).
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      trade: txEmpty(),
      order: txEmpty(),
      refundRequest: txEmpty(),
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        // Satıcı verisi temizliği: ödenecek hakediş var mı?
        count: jest.fn().mockResolvedValue(0),
      },
      // Ödenmemiş hakediş denetimi (hasUnsettledPayout): hold / takas nakdi yok.
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      refundAttempt: { count: jest.fn().mockResolvedValue(0) },
      paymentHold: txEmpty(),
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      corporateApplication: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      collection: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      deletedUserIdentity: { upsert: jest.fn().mockResolvedValue({}) },
      refreshToken: { deleteMany: jest.fn() },
      passwordResetToken: { deleteMany: jest.fn() },
      emailVerificationToken: { deleteMany: jest.fn() },
      pushToken: { deleteMany: jest.fn() },
      oAuthAccount: { deleteMany: jest.fn() },
      twoFactorSecret: { deleteMany: jest.fn() },
      savedCard: { deleteMany: jest.fn() },
      notificationLog: { deleteMany: jest.fn() },
      savedSearch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
      { recordMarketingChange: jest.fn() } as never, // consents
      { syncUserConsent: jest.fn() } as never, // newsletter
      { syncProduct: jest.fn() } as never, // search
      { del: jest.fn(), delPattern: jest.fn() } as never, // cache
      {
        notifyOfferCancelledListingRemoved: jest.fn(),
        notifyOfferCancelledBuyerDeleted: jest.fn(),
      } as never, // notifications
      appleTokens as never,
    );
    return { service, tx, prisma };
  };

  it("iptali silme transaction'ında, OAuth bağları silinmeden ÖNCE kuyruğa yazar", async () => {
    const appleTokens = { requestRevocation: jest.fn().mockResolvedValue(1) };
    const { service, tx } = makeService(appleTokens);

    await service.deleteAccount("user-1");

    expect(appleTokens.requestRevocation).toHaveBeenCalledWith(tx, "user-1");
    expect(
      appleTokens.requestRevocation.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.oAuthAccount.deleteMany.mock.invocationCallOrder[0]);
    // Kimlik arşivi her şeyden önce kalır.
    expect(
      tx.deletedUserIdentity.upsert.mock.invocationCallOrder[0],
    ).toBeLessThan(appleTokens.requestRevocation.mock.invocationCallOrder[0]);
  });

  // AppleTokenService.persistToken'ın kilit bekleme süresi bu değerden türer.
  it("silme transaction'ı paylaşılan zaman aşımıyla açılır", async () => {
    const appleTokens = { requestRevocation: jest.fn().mockResolvedValue(0) };
    const { service, prisma } = makeService(appleTokens);

    await service.deleteAccount("user-1");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: ACCOUNT_DELETION_TX_TIMEOUT_MS,
    });
  });

  it("Apple token'ı olmayan kullanıcı aynen silinir", async () => {
    const appleTokens = { requestRevocation: jest.fn().mockResolvedValue(0) };
    const { service, tx } = makeService(appleTokens);

    await expect(service.deleteAccount("user-1")).resolves.toBeUndefined();
    expect(tx.user.update).toHaveBeenCalled();
  });

  it("kuyruğa yazılamazsa (DB hatası) silme de geri alınır — yarım silme yok", async () => {
    const appleTokens = {
      requestRevocation: jest.fn().mockRejectedValue(new Error("db down")),
    };
    const { service, tx } = makeService(appleTokens);

    await expect(service.deleteAccount("user-1")).rejects.toMatchObject({
      response: { i18nKey: "server.user.deleteAccountFailed" },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
