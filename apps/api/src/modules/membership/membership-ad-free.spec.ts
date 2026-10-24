import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MembershipTierType } from "@prisma/client";
import { CreateMembershipTierDto } from "./dto/membership.dto";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipTierUpdateService } from "./membership-tier-update.service";
import { MembershipService } from "./membership.service";

/**
 * Reklamsızlık (isAdFree): admin'in katman formundaki kutu TEK kaynak. Katmanda
 * saklanır, `GET /membership/me/limits` ve katman yanıtı taşır; web BannerSlot ve
 * mobil buna uyar. Eskiden yanıtlarda hiç yoktu ("banner herkese gösterilir").
 */
describe("isAdFree — katman kutusundan istemciye", () => {
  const tierRow = (isAdFree: boolean) => ({
    id: "tier-1",
    type: MembershipTierType.premium,
    name: "Premium",
    description: null,
    monthlyPrice: 100,
    yearlyPrice: 960,
    maxFreeListings: 5,
    maxTotalListings: 50,
    maxImagesPerListing: 10,
    maxSavedSearches: 20,
    canCreateCollections: true,
    canTrade: true,
    isAdFree,
    featuredListingSlots: 0,
    isActive: true,
    sortOrder: 2,
  });

  describe("katman yanıtı", () => {
    const common = new MembershipCommonService({} as never, {} as never);

    it.each([true, false])("katmanın isAdFree=%s değerini taşır", (value) => {
      expect(common.mapTierToDto(tierRow(value)).isAdFree).toBe(value);
    });

    it("kolon null/eksik gelirse false döner (boolean sözleşmesi)", () => {
      const row = { ...tierRow(false), isAdFree: undefined };
      expect(common.mapTierToDto(row).isAdFree).toBe(false);
    });
  });

  describe("GET /membership/me/limits", () => {
    const limitsFor = async (isAdFree: boolean) => {
      const common = {
        getUserMembership: jest.fn().mockResolvedValue({
          tier: new MembershipCommonService(
            {} as never,
            {} as never,
          ).mapTierToDto(tierRow(isAdFree)),
          remainingFreeListings: 2,
          remainingTotalListings: 10,
        }),
      };
      const service = new MembershipService(
        {} as never,
        common as never,
        {} as never,
        {} as never,
      );
      return service.getUserLimits("u1");
    };

    it("reklamsız katmanda isAdFree=true", async () => {
      expect((await limitsFor(true)).isAdFree).toBe(true);
    });

    it("reklamlı katmanda isAdFree=false", async () => {
      expect((await limitsFor(false)).isAdFree).toBe(false);
    });
  });

  describe("admin kutusu katmanda saklanır", () => {
    const makeUpdate = () => {
      const row = tierRow(false);
      const tx = {
        membershipTier: {
          update: jest.fn(({ data }: any) =>
            Promise.resolve({
              ...row,
              ...Object.fromEntries(
                Object.entries(data).filter(([, v]) => v !== undefined),
              ),
            }),
          ),
        },
        platformSetting: { upsert: jest.fn() },
      };
      const prisma = {
        membershipTier: { findUnique: jest.fn().mockResolvedValue(row) },
        $transaction: jest.fn(async (fn: (c: unknown) => unknown) => fn(tx)),
      };
      const audit = { createRequiredAuditLog: jest.fn() };
      return {
        service: new MembershipTierUpdateService(
          prisma as never,
          audit as never,
        ),
        tx,
      };
    };

    it("yalnız isAdFree gönderen güncelleme kolona yazılır", async () => {
      const { service, tx } = makeUpdate();

      const updated = await service.updateTier(
        "admin-1",
        { id: "tier-1" },
        { isAdFree: true },
      );

      expect(tx.membershipTier.update.mock.calls[0][0].data.isAdFree).toBe(
        true,
      );
      expect(updated.isAdFree).toBe(true);
    });
  });

  describe("katman oluşturma DTO'su", () => {
    const base = {
      type: MembershipTierType.premium,
      name: "Premium",
      monthlyPrice: 100,
      yearlyPrice: 960,
      maxFreeListings: 5,
      maxTotalListings: 50,
      maxImagesPerListing: 10,
      canCreateCollections: true,
      canTrade: true,
    };

    it("isAdFree geçerli bir boolean olarak kabul edilir (whitelist düşürmez)", async () => {
      const dto = plainToInstance(CreateMembershipTierDto, {
        ...base,
        isAdFree: true,
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: false,
      });
      expect(errors).toEqual([]);
      // whitelist: dekoratörsüz alan olsaydı silinirdi.
      expect(dto.isAdFree).toBe(true);
    });

    it("boolean olmayan isAdFree reddedilir", async () => {
      const dto = plainToInstance(CreateMembershipTierDto, {
        ...base,
        isAdFree: "evet",
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors.map((e) => e.property)).toContain("isAdFree");
    });
  });
});
