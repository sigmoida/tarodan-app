import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MembershipTierType } from "@prisma/client";
import { SAVED_SEARCH_TIER_LIMIT_MAX } from "@tarodan/types";
import {
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
} from "./dto/membership.dto";
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

  describe("getSavedSearchLimit: the effective tier, without side effects", () => {
    const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const freeRow = { ...tierRow(5), type: MembershipTierType.free };
    const premiumRow = { ...tierRow(20), type: MembershipTierType.premium };
    const businessRow = { ...tierRow(50), type: MembershipTierType.business };

    const limitFor = (opts: {
      user?: object | null;
      membership?: object | null;
    }) => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              opts.user === undefined ? { businessStatus: null } : opts.user,
            ),
        },
        userMembership: {
          findUnique: jest.fn().mockResolvedValue(opts.membership ?? null),
          create: jest.fn(),
        },
        membershipTier: { findUnique: jest.fn().mockResolvedValue(freeRow) },
        payment: { findFirst: jest.fn() },
      };
      const membershipCommon = new MembershipCommonService(
        prisma as never,
        { verifyPaymentFromClient: jest.fn() } as never,
      );
      const service = new MembershipService(
        prisma as never,
        membershipCommon,
        {} as never,
        {} as never,
      );
      return { result: service.getSavedSearchLimit("u1"), prisma };
    };

    it("an entitled premium member gets the premium limit", async () => {
      const { result } = limitFor({
        membership: {
          status: "active",
          currentPeriodEnd: FUTURE,
          tier: premiumRow,
        },
      });
      await expect(result).resolves.toBe(20);
    });

    it.each([
      ["past due", { status: "past_due", currentPeriodEnd: FUTURE }],
      ["expired", { status: "active", currentPeriodEnd: new Date(0) }],
    ])("a %s paid member falls back to the free limit", async (_c, state) => {
      const { result, prisma } = limitFor({
        membership: { ...state, tier: premiumRow },
      });
      await expect(result).resolves.toBe(5);
      // No self-heal: no payment lookup, no membership write.
      await result;
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
      expect(prisma.userMembership.create).not.toHaveBeenCalled();
    });

    it("business without an approved corporate identity is on free", async () => {
      const { result } = limitFor({
        user: { businessStatus: "pending" },
        membership: {
          status: "active",
          currentPeriodEnd: FUTURE,
          tier: businessRow,
        },
      });
      await expect(result).resolves.toBe(5);
    });

    it("no membership row means the free limit, without creating one", async () => {
      const { result, prisma } = limitFor({ membership: null });
      await expect(result).resolves.toBe(5);
      expect(prisma.userMembership.create).not.toHaveBeenCalled();
    });

    it("a missing user is a 404", async () => {
      const { result } = limitFor({ user: null });
      await expect(result).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("tier create", () => {
    it("accepts maxSavedSearches with the update bounds", async () => {
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
      const errorsFor = (maxSavedSearches: unknown) =>
        validate(
          plainToInstance(CreateMembershipTierDto, {
            ...base,
            maxSavedSearches,
          }),
        );
      expect(await errorsFor(30)).toHaveLength(0);
      expect(await errorsFor(-1)).not.toHaveLength(0);
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
