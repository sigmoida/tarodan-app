import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MembershipTierType } from "@prisma/client";
import { SAVED_SEARCH_TIER_LIMIT_MAX } from "@tarodan/types";
import { UpdateMembershipTierDto } from "./dto/membership.dto";
import {
  MembershipCommonService,
  type MembershipTierRow,
} from "./membership-common.service";
import { MembershipTierUpdateService } from "./membership-tier-update.service";
import { MembershipService } from "./membership.service";

/**
 * The saved-search limit (critical path 13) comes only from the tier row
 * (`MembershipTier.maxSavedSearches`): the tier response and
 * `GET /membership/me/limits` serve it, admins edit it through the one tier
 * update core.
 */
describe("maxSavedSearches: tier row to client", () => {
  const tierRow = (maxSavedSearches: number): MembershipTierRow => ({
    id: "tier-1",
    type: MembershipTierType.basic,
    name: "Basic",
    description: null,
    monthlyPrice: 50,
    yearlyPrice: 480,
    maxFreeListings: 15,
    maxTotalListings: 50,
    maxImagesPerListing: 6,
    maxSavedSearches,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: false,
    isActive: true,
  });

  const common = new MembershipCommonService({} as never, {} as never);

  it("the tier response carries the tier's value", () => {
    expect(common.mapTierToDto(tierRow(10)).maxSavedSearches).toBe(10);
    expect(common.mapTierToDto(tierRow(0)).maxSavedSearches).toBe(0);
  });

  describe("GET /membership/me/limits", () => {
    const limitsFor = (maxSavedSearches: number) => {
      const membershipCommon = {
        getUserMembership: jest.fn().mockResolvedValue({
          tier: common.mapTierToDto(tierRow(maxSavedSearches)),
          remainingFreeListings: 2,
          remainingTotalListings: 10,
        }),
      };
      return new MembershipService(
        {} as never,
        membershipCommon as never,
        {} as never,
        {} as never,
      ).getUserLimits("u1");
    };

    it("serves the effective tier's limit", async () => {
      expect((await limitsFor(20)).maxSavedSearches).toBe(20);
    });

    it("adds the field without changing the old ones", async () => {
      expect(await limitsFor(10)).toEqual({
        canCreateListing: true,
        canUseFreeSlot: true,
        canTrade: true,
        canCreateCollection: true,
        isAdFree: false,
        maxImages: 6,
        maxFreeListings: 15,
        maxTotalListings: 50,
        remainingFreeListings: 2,
        remainingTotalListings: 10,
        tierName: "Basic",
        tierType: MembershipTierType.basic,
        maxSavedSearches: 10,
      });
    });
  });

  describe("admin tier update", () => {
    const dtoErrors = async (value: unknown) =>
      validate(
        plainToInstance(UpdateMembershipTierDto, { maxSavedSearches: value }),
      );

    it.each([0, 5, 50, SAVED_SEARCH_TIER_LIMIT_MAX])(
      "accepts %s",
      async (value) => {
        expect(await dtoErrors(value)).toHaveLength(0);
      },
    );

    it.each([-1, 2.5, SAVED_SEARCH_TIER_LIMIT_MAX + 1, "many"])(
      "refuses %s",
      async (value) => {
        expect(await dtoErrors(value)).not.toHaveLength(0);
      },
    );

    it("writes the column through the shared update core", async () => {
      const row = tierRow(5);
      const tx = {
        membershipTier: {
          update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...row, ...data }),
          ),
        },
        platformSetting: { upsert: jest.fn() },
      };
      const prisma = {
        membershipTier: { findUnique: jest.fn().mockResolvedValue(row) },
        $transaction: jest.fn(async (fn: (c: unknown) => unknown) => fn(tx)),
      };
      const service = new MembershipTierUpdateService(
        prisma as never,
        { createRequiredAuditLog: jest.fn() } as never,
      );

      const updated = await service.updateTier(
        "admin-1",
        { type: MembershipTierType.basic },
        { maxSavedSearches: 10 },
      );

      expect(tx.membershipTier.update.mock.calls[0][0].data).toMatchObject({
        maxSavedSearches: 10,
      });
      expect(updated.maxSavedSearches).toBe(10);
    });
  });
});
