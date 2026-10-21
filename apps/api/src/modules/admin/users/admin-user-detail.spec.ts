import {
  SELLER_TRUST_FORMULA_VERSION,
  type AdminSellerTrustView,
} from "@tarodan/types";
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

  const NOT_COMPUTED: AdminSellerTrustView = {
    rating: null,
    level: "new",
    formulaVersion: SELLER_TRUST_FORMULA_VERSION,
    components: null,
    computedAt: null,
  };

  const makeService = (
    user: Record<string, unknown> | null = row,
    trust: AdminSellerTrustView = NOT_COMPUTED,
  ) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const sellerTrust = { getAdminView: jest.fn().mockResolvedValue(trust) };
    const service = new AdminUserService(
      prisma as any,
      { createAuditLog: jest.fn() } as any,
      sellerTrust as never,
      undefined as any, // storage
    );
    return { service, prisma, sellerTrust };
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
    const { service, sellerTrust } = makeService(null);

    await expect(service.getUserById("yok")).rejects.toMatchObject({
      response: { i18nKey: "server.auth.userNotFound" },
    });
    expect(sellerTrust.getAdminView).not.toHaveBeenCalled();
  });

  describe("trust score (ADR 0014)", () => {
    it("adds the stored score with its breakdown from SellerTrustService", async () => {
      const scored: AdminSellerTrustView = {
        rating: 4.37,
        level: "trusted",
        formulaVersion: 1,
        components: {
          version: 1,
          rating: { raters: 25, smoothed: 4.6667, subScore: 0.9167 },
          reliability: { eligibleOrders: 45, failures: 1, subScore: 0.9127 },
          onTime: { shipped: 44, late: 3, subScore: 0.8704 },
          volume: { transactions: 40, counterparties: 30, subScore: 0.8047 },
          tenure: { days: 400, subScore: 0.5479 },
        },
        computedAt: "2026-10-21T23:30:00.000Z",
      };
      const { service, prisma, sellerTrust } = makeService(row, scored);

      const result = await service.getUserById("u1");

      expect(sellerTrust.getAdminView).toHaveBeenCalledWith("u1");
      expect(result.trust).toEqual(scored);
      // The table is read through its owner, never selected here.
      const select = prisma.user.findUnique.mock.calls[0][0].select;
      expect(select.sellerTrustScore).toBeUndefined();
    });

    it("says `not computed` (no breakdown, no time) when there is no row", async () => {
      const { service } = makeService();

      const result = await service.getUserById("u1");

      expect(result.trust).toEqual(NOT_COMPUTED);
    });

    it("scores the platform account like everyone else (D5)", async () => {
      const scored: AdminSellerTrustView = {
        rating: 2.5,
        level: "developing",
        formulaVersion: 1,
        components: null,
        computedAt: "2026-10-21T23:30:00.000Z",
      };
      const { service } = makeService(
        { ...row, sellerType: "platform" },
        scored,
      );

      const result = await service.getUserById("u1");

      expect(result.sellerType).toBe("platform");
      expect(result.trust).toEqual(scored);
    });
  });
});
