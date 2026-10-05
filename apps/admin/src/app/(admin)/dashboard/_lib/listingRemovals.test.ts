import { describe, expect, it } from "vitest";
import {
  LISTING_REMOVAL_PLATFORMS,
  LISTING_REMOVAL_REASONS,
  listingRemovalActorOf,
  type DashboardListingRemovalsResponse,
  type ListingRemovalReason,
} from "@tarodan/types";
import { shareOf, toListingRemovalsView } from "./listingRemovals";

/** API şekli: her neden (sıfırlar dahil) ve her platform. */
function response(
  counts: Partial<Record<ListingRemovalReason, number>>,
  platforms: Partial<Record<string, number>> = {},
  violations: Array<{ violationCode: string | null; count: number }> = [],
): DashboardListingRemovalsResponse {
  const byReason = LISTING_REMOVAL_REASONS.map((reason) => ({
    reason,
    actor: listingRemovalActorOf(reason),
    count: counts[reason] ?? 0,
  }));
  return {
    range: {
      type: "monthly",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-05T12:00:00.000Z",
    },
    total: byReason.reduce((sum, row) => sum + row.count, 0),
    byReason,
    soldElsewhereByPlatform: LISTING_REMOVAL_PLATFORMS.map((platform) => ({
      platform,
      count: platforms[platform] ?? 0,
    })),
    byViolation: violations,
  };
}

describe("toListingRemovalsView", () => {
  it("is empty (not an error) when the endpoint gave nothing", () => {
    const view = toListingRemovalsView(undefined);

    expect(view.total).toBe(0);
    expect(view.isEmpty).toBe(true);
    expect(view.byActor).toEqual([]);
    expect(view.platforms).toEqual([]);
    expect(view.violations).toEqual([]);
  });

  it("groups reasons under who removed them and hides zero rows", () => {
    const view = toListingRemovalsView(
      response({
        sold_elsewhere: 6,
        changed_mind: 2,
        expired: 2,
        policy_violation: 0,
      }),
    );

    expect(view.total).toBe(10);
    expect(view.byActor.map((group) => group.actor)).toEqual([
      "seller",
      "system",
    ]);
    expect(view.byActor[0]).toEqual({
      actor: "seller",
      count: 8,
      reasons: [
        { key: "sold_elsewhere", count: 6, share: 60 },
        { key: "changed_mind", count: 2, share: 20 },
      ],
    });
    expect(view.byActor[1].reasons).toEqual([
      { key: "expired", count: 2, share: 20 },
    ]);
  });

  it("splits sold-elsewhere by platform, largest first, shares of that subtotal", () => {
    const view = toListingRemovalsView(
      response({ sold_elsewhere: 4 }, { dolap: 1, sahibinden: 3, letgo: 0 }),
    );

    expect(view.soldElsewhereTotal).toBe(4);
    expect(view.platforms).toEqual([
      { key: "sahibinden", count: 3, share: 75 },
      { key: "dolap", count: 1, share: 25 },
    ]);
  });

  it("keeps a code-less rejection as its own violation row", () => {
    const view = toListingRemovalsView(
      response({ policy_violation: 3 }, {}, [
        { violationCode: "counterfeit_replica", count: 2 },
        { violationCode: null, count: 1 },
      ]),
    );

    expect(view.violationTotal).toBe(3);
    expect(view.violations).toEqual([
      { key: "counterfeit_replica", count: 2, share: 67 },
      { key: null, count: 1, share: 33 },
    ]);
  });

  it("coerces string counts", () => {
    const view = toListingRemovalsView({
      byReason: [
        { reason: "out_of_stock", actor: "system", count: "5" as never },
      ],
    });

    expect(view.total).toBe(5);
  });
});

describe("shareOf", () => {
  it("is 0 for an empty section instead of NaN", () => {
    expect(shareOf(0, 0)).toBe(0);
    expect(shareOf(1, 3)).toBe(33);
  });
});
