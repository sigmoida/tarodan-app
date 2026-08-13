import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MembershipTierType } from "@prisma/client";
import { MembershipTierUpdateService } from "./membership-tier-update.service";
import { MembershipService } from "./membership.service";
import { AdminMembershipService } from "../admin/admin-membership.service";
import { MAX_PRODUCT_IMAGES } from "../product/helpers/product-image-keys";
import { invalidateFreeTierCanTradeCache } from "./free-tier-trade.helper";

jest.mock("./free-tier-trade.helper", () => ({
  invalidateFreeTierCanTradeCache: jest.fn(),
}));

/**
 * Katman güncellemesinin iki paralel admin rotası (PATCH /admin/membership-tiers/:id
 * ve PATCH /membership/admin/tiers/:type) TEK çekirdekten geçmeli.
 *
 * Regresyon: kopya kod zamanla ayrışmıştı — görsel tavanı bir yolda 20, diğerinde
 * sınırsız; audit log yalnız /admin yolunda; free.canTrade süreç-içi cache'ini
 * (60 sn) İKİ yol da düşürmüyordu (yorum "admin paneli düşürür" diyordu ama
 * fonksiyonun hiç çağıranı yoktu).
 */
describe("MembershipTierUpdateService — ortak çekirdek", () => {
  const adminId = "admin-user-1";

  const tierRow = (overrides: Record<string, unknown> = {}) => ({
    id: "tier-1",
    type: MembershipTierType.premium,
    name: "Premium",
    description: null,
    monthlyPrice: 100,
    yearlyPrice: 960,
    maxFreeListings: 5,
    maxTotalListings: 50,
    maxImagesPerListing: 10,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: false,
    featuredListingSlots: 0,
    isActive: true,
    sortOrder: 2,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  });

  const freeTierRow = (overrides: Record<string, unknown> = {}) =>
    tierRow({
      id: "tier-free",
      type: MembershipTierType.free,
      name: "Ücretsiz",
      monthlyPrice: 0,
      yearlyPrice: 0,
      canTrade: false,
      sortOrder: 0,
      ...overrides,
    });

  const makeService = (tier: ReturnType<typeof tierRow> | null) => {
    // update sonucu: undefined alanlar Prisma'daki gibi "dokunulmadı" sayılır.
    const applyDefined = (row: Record<string, unknown>, data: any) => ({
      ...row,
      ...Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    });

    const tx = {
      membershipTier: {
        update: jest.fn(({ data }: any) =>
          Promise.resolve(applyDefined(tier as any, data)),
        ),
      },
      platformSetting: { upsert: jest.fn() },
    };
    const prisma = {
      membershipTier: { findUnique: jest.fn().mockResolvedValue(tier) },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };
    const audit = { createRequiredAuditLog: jest.fn() };
    const service = new MembershipTierUpdateService(
      prisma as any,
      audit as any,
    );
    return { service, prisma, tx, audit };
  };

  beforeEach(() => {
    (invalidateFreeTierCanTradeCache as jest.Mock).mockClear();
  });

  it("katman yoksa NotFound", async () => {
    const { service } = makeService(null);

    await expect(
      service.updateTier(adminId, { id: "yok" }, { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("boş gövde reddedilir", async () => {
    const { service } = makeService(tierRow());

    await expect(
      service.updateTier(adminId, { id: "tier-1" }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maxTotalListings: 0 reddedilir, -1 (sınırsız) kabul edilir", async () => {
    const { service } = makeService(tierRow());

    await expect(
      service.updateTier(adminId, { id: "tier-1" }, { maxTotalListings: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTier(adminId, { id: "tier-1" }, { maxTotalListings: -1 }),
    ).resolves.toBeDefined();
  });

  it("görsel limiti mutlak tavanı aşamaz (iki rota da aynı sınırı görür)", async () => {
    const { service } = makeService(tierRow());

    await expect(
      service.updateTier(
        adminId,
        { id: "tier-1" },
        { maxImagesPerListing: MAX_PRODUCT_IMAGES + 1 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTier(adminId, { id: "tier-1" }, { maxImagesPerListing: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTier(
        adminId,
        { id: "tier-1" },
        { maxImagesPerListing: MAX_PRODUCT_IMAGES },
      ),
    ).resolves.toBeDefined();
  });

  it("free katman pasifleştirilemez ve fiyatlanamaz", async () => {
    const { service } = makeService(freeTierRow());

    await expect(
      service.updateTier(
        adminId,
        { type: MembershipTierType.free },
        {
          isActive: false,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTier(
        adminId,
        { type: MembershipTierType.free },
        {
          monthlyPrice: 10,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ücretli katman fiyatı sıfır/negatif olamaz", async () => {
    const { service } = makeService(tierRow());

    await expect(
      service.updateTier(adminId, { id: "tier-1" }, { monthlyPrice: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTier(adminId, { id: "tier-1" }, { yearlyPrice: -5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("her başarılı güncelleme audit log yazar", async () => {
    const { service, audit } = makeService(tierRow());

    await service.updateTier(adminId, { id: "tier-1" }, { name: "Premium+" });

    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      adminId,
      "membership_tier_update",
      "MembershipTier",
      "tier-1",
      expect.objectContaining({ name: "Premium" }),
      expect.objectContaining({ name: "Premium+" }),
    );
  });

  it("ücretli aylık fiyat platform ayarına senkronlanır", async () => {
    const { service, tx } = makeService(tierRow());

    await service.updateTier(adminId, { id: "tier-1" }, { monthlyPrice: 149 });

    expect(tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: "premium_monthly_price" },
        update: { settingValue: "149" },
      }),
    );
  });

  it("free.canTrade değişince süreç-içi cache düşürülür", async () => {
    const { service } = makeService(freeTierRow({ canTrade: false }));

    await service.updateTier(
      adminId,
      { type: MembershipTierType.free },
      {
        canTrade: true,
      },
    );

    expect(invalidateFreeTierCanTradeCache).toHaveBeenCalledTimes(1);
  });

  it("canTrade'e dokunmayan free güncellemesi cache'i düşürmez", async () => {
    const { service } = makeService(freeTierRow());

    await service.updateTier(
      adminId,
      { type: MembershipTierType.free },
      {
        name: "Ücretsiz+",
      },
    );

    expect(invalidateFreeTierCanTradeCache).not.toHaveBeenCalled();
  });

  it("ücretli katmanın canTrade değişimi free cache'ine dokunmaz", async () => {
    const { service } = makeService(tierRow({ canTrade: false }));

    await service.updateTier(adminId, { id: "tier-1" }, { canTrade: true });

    expect(invalidateFreeTierCanTradeCache).not.toHaveBeenCalled();
  });
});

describe("iki admin rotası da çekirdeğe delege eder", () => {
  const adminId = "admin-user-1";
  const updatedRow = { id: "tier-1", type: MembershipTierType.premium };

  it("MembershipService.updateTier → çekirdek (type seçicisiyle)", async () => {
    const tierUpdate = {
      updateTier: jest.fn().mockResolvedValue(updatedRow),
    };
    const common = { mapTierToDto: jest.fn((t: unknown) => t) };
    const service = new MembershipService(
      {} as any,
      common as any,
      {} as any,
      tierUpdate as any,
    );

    await service.updateTier(
      MembershipTierType.premium,
      { name: "Premium+" } as any,
      adminId,
    );

    expect(tierUpdate.updateTier).toHaveBeenCalledWith(
      adminId,
      { type: MembershipTierType.premium },
      { name: "Premium+" },
    );
    expect(common.mapTierToDto).toHaveBeenCalledWith(updatedRow);
  });

  it("AdminMembershipService.updateMembershipTier → çekirdek (id seçicisiyle)", async () => {
    const tierUpdate = {
      updateTier: jest.fn().mockResolvedValue(updatedRow),
    };
    const service = new AdminMembershipService({} as any, tierUpdate as any);

    await service.updateMembershipTier(adminId, "tier-1", { name: "Premium+" });

    expect(tierUpdate.updateTier).toHaveBeenCalledWith(
      adminId,
      { id: "tier-1" },
      { name: "Premium+" },
    );
  });
});

describe("MembershipService.createTier — sortOrder yazılır", () => {
  it("sortOrder yükseltme/düşürme yönünü belirler; create artık yazabilmeli", async () => {
    const create = jest.fn(({ data }: any) =>
      Promise.resolve({ id: "tier-new", ...data }),
    );
    const prisma = {
      membershipTier: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const common = { mapTierToDto: jest.fn((t: unknown) => t) };
    const service = new MembershipService(
      prisma as any,
      common as any,
      {} as any,
      {} as any,
    );

    await service.createTier({
      type: MembershipTierType.business,
      name: "Business",
      monthlyPrice: 500,
      yearlyPrice: 4800,
      maxFreeListings: 10,
      maxTotalListings: -1,
      maxImagesPerListing: 15,
      canCreateCollections: true,
      canTrade: true,
      sortOrder: 3,
    } as any);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 3 }),
      }),
    );
  });
});
