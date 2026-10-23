import { MembershipTierType } from "@prisma/client";
import {
  SAVED_SEARCH_TIER_LIMITS,
  planSavedSearchLimitUpdates,
} from "./saved-search-tier-limits";

/** Critical path 13: the launch values, and a re-runnable post-deploy step. */
describe("saved-search tier limits", () => {
  it("pins the launch ladder 5 / 10 / 20 / 50", () => {
    expect(SAVED_SEARCH_TIER_LIMITS).toEqual({
      free: 5,
      basic: 10,
      premium: 20,
      business: 50,
    });
  });

  it("raises the paid tiers that are still at the migration default", () => {
    const tiers = Object.values(MembershipTierType).map((type) => ({
      type,
      maxSavedSearches: 5,
    }));

    expect(planSavedSearchLimitUpdates(tiers)).toEqual([
      { type: "basic", from: 5, to: 10 },
      { type: "premium", from: 5, to: 20 },
      { type: "business", from: 5, to: 50 },
    ]);
  });

  it("leaves admin-edited values alone, so a re-run changes nothing", () => {
    expect(
      planSavedSearchLimitUpdates([
        { type: MembershipTierType.free, maxSavedSearches: 5 },
        { type: MembershipTierType.basic, maxSavedSearches: 10 },
        { type: MembershipTierType.premium, maxSavedSearches: 30 },
        { type: MembershipTierType.business, maxSavedSearches: 0 },
      ]),
    ).toEqual([]);
  });
});
