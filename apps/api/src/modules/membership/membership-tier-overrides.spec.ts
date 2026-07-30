import { MembershipTierType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipService } from "./membership.service";
import { MembershipSubscriptionService } from "./membership-subscription.service";

/**
 * İlan limiti override'ları (PlatformSetting `*_listing_limit`) UYGULANAN
 * limitin parçası; o hâlde VAAT EDİLEN limit de aynı kaynaktan geçmeli.
 *
 * `/membership/tiers` (üyelik sayfası + checkout kartlarının kaynağı) tier
 * satırını override'sız döndürüyordu: admin Sistem Ayarları'ndan limiti
 * değiştirdiğinde sayfa eski limiti vaat ediyor, kullanıcı yenisine takılıyordu.
 */
describe("MembershipService.getAllTiers — platform listing-limit overrides", () => {
  const tierRow = (
    type: MembershipTierType,
    maxFree: number,
    maxTotal: number,
    sortOrder: number,
  ) => ({
    id: `tier-${type}`,
    type,
    name: `${type} tier`,
    description: null,
    monthlyPrice: 100,
    yearlyPrice: 960,
    maxFreeListings: maxFree,
    maxTotalListings: maxTotal,
    maxImagesPerListing: 5,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: false,
    featuredListingSlots: 0,
    isActive: true,
    sortOrder,
  });

  const tiers = [
    tierRow(MembershipTierType.free, 5, 10, 0),
    tierRow(MembershipTierType.basic, 15, 50, 1),
    tierRow(MembershipTierType.premium, 50, 200, 2),
    tierRow(MembershipTierType.business, 200, 1000, 3),
  ];

  const makeService = (settings: Record<string, string | undefined>) => {
    const prisma = {
      membershipTier: { findMany: jest.fn().mockResolvedValue(tiers) },
      platformSetting: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(
            settings[where.settingKey] != null
              ? {
                  settingKey: where.settingKey,
                  settingValue: settings[where.settingKey],
                }
              : null,
          ),
        ),
      },
    } as unknown as PrismaService;
    const common = new MembershipCommonService(prisma, {} as any);
    return new MembershipService(
      prisma,
      common,
      {} as MembershipSubscriptionService,
    );
  };

  const byType = (
    list: Array<{
      type: string;
      maxFreeListings: number;
      maxTotalListings: number;
    }>,
    type: string,
  ) => list.find((t) => t.type === type)!;

  it("override yokken tier satırındaki limitler döner", async () => {
    const service = makeService({});

    const result = await service.getAllTiers();

    expect(byType(result, "free").maxTotalListings).toBe(10);
    expect(byType(result, "basic").maxTotalListings).toBe(50);
    expect(byType(result, "premium").maxTotalListings).toBe(200);
    expect(byType(result, "business").maxTotalListings).toBe(1000);
  });

  it("her tier kendi platform ayarı override'ını yansıtır (uygulanan = vaat edilen)", async () => {
    const service = makeService({
      free_listing_limit: "7",
      basic_listing_limit: "60",
      premium_listing_limit: "100",
      business_listing_limit: "-1",
    });

    const result = await service.getAllTiers();

    // Free: toplam = ücretsiz = platform limiti.
    expect(byType(result, "free").maxFreeListings).toBe(7);
    expect(byType(result, "free").maxTotalListings).toBe(7);
    expect(byType(result, "basic").maxTotalListings).toBe(60);
    expect(byType(result, "premium").maxTotalListings).toBe(100);
    // -1 = sınırsız.
    expect(byType(result, "business").maxTotalListings).toBe(-1);
  });

  it("geçersiz ayar değeri tier satırını bozmaz", async () => {
    const service = makeService({
      premium_listing_limit: "abc",
      free_listing_limit: "0", // free için yalnız > 0 geçerli
    });

    const result = await service.getAllTiers();

    expect(byType(result, "premium").maxTotalListings).toBe(200);
    expect(byType(result, "free").maxTotalListings).toBe(10);
  });
});
