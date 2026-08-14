import { BadRequestException } from "@nestjs/common";
import { ProductUpdateService } from "./product-update.service";

/**
 * İlanı takasa açma kapısı, takas TEKLİF/KABUL kapılarıyla AYNI kaynağı
 * (membershipService.canCreateTrade → efektif tier'ın canTrade bayrağı)
 * kullanmalı.
 *
 * Eski kapı `tier.canTrade && isPremiumEntitled` istiyordu: free tier'da
 * entitled hep false olduğundan, admin free tier'a takası AÇSA bile (tier
 * formundaki canTrade kutusu) ürün takasa işaretlenemiyordu — oysa aynı
 * kullanıcı takas teklifi verebiliyordu (canCreateTrade free bayrağını tanır)
 * ve downgrade cron'u da free.canTrade'e bakar. Üç kapı tek kaynağa iner.
 */
describe("ProductCreateService — ilan oluştururken takasa açma kapısı", () => {
  // Update yolunda kapı vardı ama CREATE yolunda `isTradeEnabled` DTO'dan
  // güvenilmeden yazılıyordu: takas hakkı olmayan kullanıcı API'den doğrudan
  // takaslı ilan açabiliyordu (önyüz kutuyu gizlese de backend zorunlu kapı).
  const makeCreateService = (canTrade: boolean) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "seller-1",
          isBanned: false,
          isSeller: true,
        }),
      },
    };
    const membershipService = {
      canCreateListing: jest.fn().mockResolvedValue({ allowed: true }),
      getUserLimits: jest.fn().mockResolvedValue({
        maxImages: 10,
        canTrade,
        tierName: "Ücretsiz",
      }),
    };
    const { ProductCreateService } = require("./product-create.service");
    return new ProductCreateService(
      prisma as any,
      {} as any,
      membershipService as any,
      {} as any,
      {} as any,
      { isEnabled: false, assertTextClean: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { assertListingRuleExists: jest.fn() } as any,
    );
  };

  it("takas hakkı olmayan satıcının isTradeEnabled=true isteğini reddeder", async () => {
    const service = makeCreateService(false);

    await expect(
      service.create("seller-1", {
        title: "Test",
        isTradeEnabled: true,
        images: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ProductUpdateService — takasa açma kapısı", () => {
  const makeService = (canTrade: { allowed: boolean; reason?: string }) => {
    const membershipService = {
      canCreateTrade: jest.fn().mockResolvedValue(canTrade),
    };
    const service = new ProductUpdateService(
      {} as any, // prisma — kapı artık membershipService'e delege eder
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      membershipService as any,
      { assertListingRuleExists: jest.fn() } as any,
      // moderationAi — düzenleme içerik kapıları (bu spec'in konusu değil)
      { assertTextClean: jest.fn(), isEnabled: false } as any,
    );
    return { service, membershipService };
  };

  it("takas hakkı olmayan satıcıyı reddeder (süresi dolmuş premium)", async () => {
    const { service, membershipService } = makeService({
      allowed: false,
      reason: "membership_expired",
    });

    await expect(
      (service as any).assertTradeEnableAllowed("seller-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(membershipService.canCreateTrade).toHaveBeenCalledWith("seller-1");
  });

  it("admin free tier'a takası açtıysa free üye ilanını takasa işaretleyebilir", async () => {
    // canCreateTrade efektif tier'ın canTrade bayrağını okur; free tier'da
    // bayrak açıksa allowed döner — kapı buna saygı göstermeli.
    const { service } = makeService({ allowed: true });

    await expect(
      (service as any).assertTradeEnableAllowed("seller-1"),
    ).resolves.toBeUndefined();
  });
});
