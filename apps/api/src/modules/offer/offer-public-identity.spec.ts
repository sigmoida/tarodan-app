import { OfferService } from "./offer.service";

/**
 * Teklif yanıtı karşı tarafın kullanıcı satırını olduğu gibi yayıyordu:
 * bildirim için seçilen `email` ve gerçek ad alıcıya/satıcıya gidiyordu.
 * Sözleşme: karşı taraf yalnızca herkese açık kimliğiyle görünür.
 */
describe("formatOfferResponse counterparty", () => {
  const makeService = () =>
    new OfferService(
      {} as any, // prisma
      {} as any, // cache
      { get: () => "24" } as any, // configService
      {} as any, // eventService
      {} as any, // notificationService
      {} as any, // orderService
      {} as any, // productLockService
      undefined as any, // storageService (@Optional)
      {} as any, // checkoutCommon
      {
        isBlockedEither: async () => false,
        getHiddenUserIds: async () => [],
      } as any,
    );

  const offer = {
    id: "offer-1",
    amount: 250,
    status: "pending",
    expiresAt: new Date(Date.now() + 3600_000),
    product: { id: "p1", title: "Ürün", price: 500, status: "active" },
    buyer: {
      id: "buyer-1",
      username: "kaan.merakli",
      displayName: "Kaan İlhan",
      companyName: null,
      email: "kaan@example.com",
      isVerified: false,
      avatarUrl: null,
    },
    seller: {
      id: "seller-1",
      username: "legacy_00000007",
      displayName: "Ayşe Yılmaz",
      companyName: "Tarodan Otomotiv A.Ş.",
      email: "satis@tarodan.com",
      isVerified: true,
      avatarUrl: null,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("drops the email and the real name from both parties", async () => {
    const result = await (makeService() as any).formatOfferResponse(offer);

    expect(result.buyer.publicName).toBe("kaan.merakli");
    expect(result.seller.publicName).toBe("Tarodan Otomotiv A.Ş.");
    expect(result.buyer).not.toHaveProperty("email");
    expect(result.seller).not.toHaveProperty("email");
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("kaan@example.com");
    expect(payload).not.toContain("satis@tarodan.com");
    expect(payload).not.toContain("Kaan İlhan");
    expect(payload).not.toContain("Ayşe Yılmaz");
  });

  it("keeps id, verification badge and avatar", async () => {
    const result = await (makeService() as any).formatOfferResponse(offer);

    expect(result.buyer.id).toBe("buyer-1");
    expect(result.seller.isVerified).toBe(true);
    expect(result.seller.avatarUrl).toBeNull();
  });
});
