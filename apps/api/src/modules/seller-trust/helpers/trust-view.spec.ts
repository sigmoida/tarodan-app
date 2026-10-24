import { SELLER_TRUST_FORMULA_VERSION } from "@tarodan/types";
import {
  parseTrustComponents,
  toAdminSellerTrustView,
  toSellerTrustView,
} from "./trust-view";

const COMPONENTS = {
  version: 1,
  rating: { raters: 5, smoothed: 4.5, subScore: 0.875 },
  reliability: { eligibleOrders: 5, failures: 0, subScore: 0.9467 },
  onTime: { shipped: 5, late: 0, subScore: 0.9333 },
  volume: { transactions: 5, counterparties: 5, subScore: 0.3882 },
  tenure: { days: 60, subScore: 0.0822 },
};

describe("toSellerTrustView", () => {
  it("maps a stored score to the two-decimal rating and its level", () => {
    expect(toSellerTrustView({ scoreX100: 374, formulaVersion: 1 })).toEqual({
      rating: 3.74,
      level: "fair",
      formulaVersion: 1,
    });
    expect(toSellerTrustView({ scoreX100: 450, formulaVersion: 1 })).toEqual({
      rating: 4.5,
      level: "excellent",
      formulaVersion: 1,
    });
  });

  it("is `new` for a row below the minimum data rule", () => {
    expect(toSellerTrustView({ scoreX100: null, formulaVersion: 1 })).toEqual({
      rating: null,
      level: "new",
      formulaVersion: 1,
    });
  });

  it("is `new` with the current formula version when there is no row", () => {
    expect(toSellerTrustView(null)).toEqual({
      rating: null,
      level: "new",
      formulaVersion: SELLER_TRUST_FORMULA_VERSION,
    });
  });

  it("keeps the version that produced the row", () => {
    expect(
      toSellerTrustView({ scoreX100: 300, formulaVersion: 7 }).formulaVersion,
    ).toBe(7);
  });
});

describe("toAdminSellerTrustView", () => {
  const computedAt = new Date("2026-10-21T23:30:00.000Z");

  it("adds the breakdown and the run time", () => {
    expect(
      toAdminSellerTrustView({
        scoreX100: 395,
        formulaVersion: 1,
        components: COMPONENTS,
        computedAt,
      }),
    ).toEqual({
      rating: 3.95,
      level: "fair",
      formulaVersion: 1,
      components: COMPONENTS,
      computedAt: "2026-10-21T23:30:00.000Z",
    });
  });

  it("keeps the breakdown of a row without a score (not enough data)", () => {
    const view = toAdminSellerTrustView({
      scoreX100: null,
      formulaVersion: 1,
      components: COMPONENTS,
      computedAt,
    });
    expect(view).toMatchObject({ rating: null, level: "new" });
    expect(view.components).toEqual(COMPONENTS);
    expect(view.computedAt).toBe("2026-10-21T23:30:00.000Z");
  });

  it("has no breakdown and no time when there is no row (not computed)", () => {
    expect(toAdminSellerTrustView(null)).toEqual({
      rating: null,
      level: "new",
      formulaVersion: SELLER_TRUST_FORMULA_VERSION,
      components: null,
      computedAt: null,
    });
  });
});

describe("parseTrustComponents", () => {
  it("accepts the v1 breakdown", () => {
    expect(parseTrustComponents(COMPONENTS)).toEqual(COMPONENTS);
  });

  it.each([
    ["another version", { ...COMPONENTS, version: 2 }],
    ["no version", { rating: COMPONENTS.rating }],
    ["an array", [COMPONENTS]],
    ["a scalar", "v1"],
    ["null", null],
  ])("returns null for %s", (_label, json) => {
    expect(parseTrustComponents(json as never)).toBeNull();
  });
});
