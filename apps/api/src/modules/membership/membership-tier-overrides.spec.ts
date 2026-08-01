import { MembershipTierType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipService } from "./membership.service";
import { MembershipSubscriptionService } from "./membership-subscription.service";

/**
 * ÜYELİK KATMANI = TEK KAYNAK.
 *
 * İlan limitleri eskiden `platform_settings`'teki `*_listing_limit`
 * anahtarlarıyla ezilebiliyordu. Bu anahtarlar seed'de yoktu; ama Sistem
 * Ayarları sayfası olmayan ayar için uydurma varsayılan gösteriyor (premium/
 * business için -1) ve Kaydet aktif sekmenin TÜM alanlarını yazıyordu. Sonuç:
 * ilan sekmesinde herhangi bir kaydetme premium (200) ve business (1000)
 * katmanlarını sessizce SINIRSIZ yapıyordu.
 *
 * Bu spec, override mekanizmasının geri gelmemesini korur: ayar satırı VARSA
 * BİLE katman satırındaki limit geçerlidir.
 */
describe("MembershipService.getAllTiers — limitler yalnız katman satırından", () => {
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

  /** `settings` bilerek doldurulabilir: hiçbiri sonucu ETKİLEMEMELİ. */
  const makeService = (settings: Record<string, string | undefined> = {}) => {
    const platformSettingFindUnique = jest.fn(({ where }: any) =>
      Promise.resolve(
        settings[where.settingKey] != null
          ? {
              settingKey: where.settingKey,
              settingValue: settings[where.settingKey],
            }
          : null,
      ),
    );
    const prisma = {
      membershipTier: { findMany: jest.fn().mockResolvedValue(tiers) },
      platformSetting: { findUnique: platformSettingFindUnique },
    } as unknown as PrismaService;
    const common = new MembershipCommonService(prisma, {} as any);
    const service = new MembershipService(
      prisma,
      common,
      {} as MembershipSubscriptionService,
    );
    return { service, platformSettingFindUnique };
  };

  const byType = (
    list: Array<{
      type: string;
      maxFreeListings: number;
      maxTotalListings: number;
    }>,
    type: string,
  ) => list.find((t) => t.type === type)!;

  it("katman satırındaki limitler olduğu gibi döner", async () => {
    const { service } = makeService();

    const result = await service.getAllTiers();

    expect(byType(result, "free").maxFreeListings).toBe(5);
    expect(byType(result, "free").maxTotalListings).toBe(10);
    expect(byType(result, "basic").maxTotalListings).toBe(50);
    expect(byType(result, "premium").maxTotalListings).toBe(200);
    expect(byType(result, "business").maxTotalListings).toBe(1000);
  });

  it("kalıntı *_listing_limit ayarları limitleri EZEMEZ", async () => {
    // Sahada bu satırlar (Ayarlar ekranından kaydeden bir admin yüzünden)
    // oluşmuş olabilir; migration onları siler, ama kod da bağışık olmalı.
    const { service } = makeService({
      free_listing_limit: "7",
      basic_listing_limit: "60",
      premium_listing_limit: "-1",
      business_listing_limit: "-1",
    });

    const result = await service.getAllTiers();

    expect(byType(result, "free").maxFreeListings).toBe(5);
    expect(byType(result, "free").maxTotalListings).toBe(10);
    expect(byType(result, "basic").maxTotalListings).toBe(50);
    expect(byType(result, "premium").maxTotalListings).toBe(200);
    expect(byType(result, "business").maxTotalListings).toBe(1000);
  });

  it("katman listesi için hiç platform ayarı OKUNMAZ", async () => {
    const { service, platformSettingFindUnique } = makeService({
      premium_listing_limit: "-1",
    });

    await service.getAllTiers();

    expect(platformSettingFindUnique).not.toHaveBeenCalled();
  });
});
