import { AdminUserService } from "./admin-user.service";

/**
 * Admin kullanıcı detayı `include:` + `...u` ile dönüyordu: User'ın her sütunu
 * ve ilişkilerin ham hâli yanıta giriyordu. Ayrıca iki alan adı ekranla
 * uyuşmuyordu — takas kalemleri (`items` vs `initiatorItems`) Takaslar
 * sekmesini TypeError ile düşürüyor, adres alanları boş basılıyordu.
 */
describe("AdminUserService.getUserById", () => {
  const row = {
    id: "u1",
    email: "u@example.com",
    phone: "+905551112233",
    displayName: "Kullanıcı",
    avatarUrl: null,
    bio: null,
    isVerified: false,
    isEmailVerified: true,
    isPhoneVerified: false,
    isSeller: true,
    sellerType: "individual",
    taxId: null,
    companyName: null,
    createdAt: new Date("2026-01-01"),
    bannedAt: null,
    bannedReason: null,
    isBanned: false,
    deletedAt: null,
    lastLoginAt: null,
    lastActivityAt: null,
    addresses: [
      {
        id: "a1",
        title: "Ev",
        address: "Bağdat Cad. No:1",
        city: "İstanbul",
        district: "Kadıköy",
        zipCode: "34710",
        isDefault: true,
      },
    ],
    products: [],
    buyerOrders: [],
    sellerOrders: [],
    initiatedTrades: [
      {
        id: "t1",
        tradeNumber: "TKS-10001",
        status: "pending",
        createdAt: new Date("2026-02-01"),
        cashAmount: null,
        receiver: { id: "u2", displayName: "Karşı" },
        items: [
          { side: "initiator", product: { id: "p1", title: "A" } },
          { side: "initiator", product: { id: "p2", title: "B" } },
          { side: "receiver", product: { id: "p3", title: "C" } },
        ],
      },
    ],
    receivedTrades: [],
    givenRatings: [],
    receivedRatings: [],
    membership: null,
    bankAccount: null,
    _count: {
      products: 0,
      buyerOrders: 0,
      sellerOrders: 0,
      givenRatings: 0,
      receivedRatings: 0,
      initiatedTrades: 1,
      receivedTrades: 0,
      sentMessages: 0,
      receivedMessages: 0,
    },
  };

  const makeService = (user: Record<string, unknown> | null = row) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const service = new AdminUserService(
      prisma as any,
      { createAuditLog: jest.fn() } as any,
      undefined as any,
    );
    return { service, prisma };
  };

  it("yalnız ekranın okuduğu alanları seçer — passwordHash/fcmToken çekilmez", async () => {
    const { service, prisma } = makeService();

    await service.getUserById("u1");

    const args = prisma.user.findUnique.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    for (const secret of [
      "passwordHash",
      "fcmToken",
      "notificationSettings",
      "bannedBy",
      "birthDate",
    ]) {
      expect(args.select[secret]).toBeUndefined();
    }
  });

  it("ham ilişki dizilerini ve _count'u yanıta sızdırmaz", async () => {
    const { service } = makeService();

    const result: Record<string, unknown> = await service.getUserById("u1");

    for (const raw of [
      "buyerOrders",
      "sellerOrders",
      "initiatedTrades",
      "receivedTrades",
      "_count",
    ]) {
      expect(result[raw]).toBeUndefined();
    }
    expect(result.recentOrders).toEqual([]);
    expect(result.stats).toMatchObject({ tradesCount: 1 });
  });

  it("takas kalemlerini side'a göre böler (Takaslar sekmesi bunu okuyor)", async () => {
    const { service } = makeService();

    const result: any = await service.getUserById("u1");
    const trade = result.recentTrades[0];

    expect(trade.items).toBeUndefined();
    expect(trade.initiatorItems).toHaveLength(2);
    expect(trade.receiverItems).toHaveLength(1);
    expect(trade.role).toBe("initiator");
  });

  it("adresi ekranın beklediği alan adlarıyla döndürür", async () => {
    const { service } = makeService();

    const result: any = await service.getUserById("u1");

    expect(result.addresses[0]).toEqual({
      id: "a1",
      title: "Ev",
      fullAddress: "Bağdat Cad. No:1",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
      isDefault: true,
    });
  });

  it("olmayan kullanıcıda 404", async () => {
    const { service } = makeService(null);

    await expect(service.getUserById("yok")).rejects.toMatchObject({
      response: { i18nKey: "server.auth.userNotFound" },
    });
  });
});
