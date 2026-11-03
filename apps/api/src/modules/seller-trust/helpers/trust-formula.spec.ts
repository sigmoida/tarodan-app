import {
  sellerTrustLevel,
  SELLER_TRUST_COMPONENTS_V1,
  SELLER_TRUST_FORMULA_VERSION,
  SELLER_TRUST_WEIGHTS_V1,
} from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";
import { computeSellerTrust, toScoreX100 } from "./trust-formula";
import { SELLER_TRUST_GOLDEN_V1 } from "./trust-golden-v1";
import { trustInputs as inputs } from "../testing/trust-inputs-fixture";

/**
 * Pins seller trust formula v1 rules to `docs/SELLER_TRUST.md`: the minimum
 * data rule, priors, clamps, rounding, levels and the stored breakdown. The
 * worked examples (cases A to F of tarodan-ops
 * plans/2026-10-21-seller-trust-score.md, section 3.6) are golden scenarios
 * in `trust-golden-v1.ts` (`trust-formula.golden.spec.ts`). A failing case
 * here is a formula change: bump SELLER_TRUST_FORMULA_VERSION and get the
 * product decision first.
 */
describe("computeSellerTrust (formula v1)", () => {
  describe("minimum data (D2)", () => {
    it("A new: 3 sales and two 5-star ratings have no score", () => {
      const aNew = SELLER_TRUST_GOLDEN_V1[0];
      expect(aNew.key).toBe("aNew");
      const result = computeSellerTrust(aNew.inputs);
      expect(result.scoreX100).toBeNull();
      expect(sellerTrustLevel(result.scoreX100)).toBe("new");
      // The breakdown is still kept for admin support.
      expect(result.components.volume).toEqual({
        transactions: 3,
        counterparties: 3,
        subScore: expect.any(Number),
      });
    });

    it("5 transactions from only 2 counterparties have no score", () => {
      expect(
        computeSellerTrust(inputs({ transactions: 5, counterparties: 2 }))
          .scoreX100,
      ).toBeNull();
    });

    it("exactly 5 transactions from 3 counterparties is scored", () => {
      expect(
        computeSellerTrust(inputs({ transactions: 5, counterparties: 3 }))
          .scoreX100,
      ).not.toBeNull();
    });
  });

  describe("priors and clamps", () => {
    it("no data at all sits on the priors", () => {
      const comp = computeSellerTrust(inputs({})).components;
      expect(comp.rating.smoothed).toBe(4); // prior m
      expect(comp.rating.subScore).toBe(0.75);
      expect(comp.reliability.subScore).toBe(0.92); // f = 0.02
      expect(comp.onTime.subScore).toBe(0.9); // l = 0.05
      expect(comp.volume.subScore).toBe(0);
      expect(comp.tenure.subScore).toBe(0);
    });

    it("one early failure does not zero a new seller", () => {
      const comp = computeSellerTrust(
        inputs({ eligibleOrders: 1, failures: 1 }),
      ).components;
      // f = (1 + 0.2) / 11 = 0.1091 -> s2 = 0.5636
      expect(comp.reliability.subScore).toBeCloseTo(0.5636, 4);
    });

    it("a failure rate of 25 % or more gives reliability 0, never negative", () => {
      const comp = computeSellerTrust(
        inputs({ eligibleOrders: 40, failures: 30 }),
      ).components;
      expect(comp.reliability.subScore).toBe(0);
    });

    it("a late rate of 50 % or more gives on-time 0, never negative", () => {
      const comp = computeSellerTrust(
        inputs({ shipped: 20, late: 20 }),
      ).components;
      expect(comp.onTime.subScore).toBe(0);
    });

    it("volume and tenure saturate at 1", () => {
      const comp = computeSellerTrust(
        inputs({ transactions: 5000, tenureDays: 5000 }),
      ).components;
      expect(comp.volume.subScore).toBe(1);
      expect(comp.tenure.subScore).toBe(1);
    });

    it("all-1-star ratings with perfect operations stay inside 0..500", () => {
      const result = computeSellerTrust(
        inputs({
          raters: 1000,
          sumOfGiverMeans: 1000,
          eligibleOrders: 10,
          shipped: 10,
          transactions: 10,
          counterparties: 10,
        }),
      );
      expect(result.scoreX100).toBeGreaterThanOrEqual(0);
      expect(result.scoreX100).toBeLessThanOrEqual(500);
    });
  });

  it("stores counts and sub-scores only, tagged with the formula version", () => {
    const comp = computeSellerTrust(
      inputs({ raters: 1, sumOfGiverMeans: 5 }),
    ).components;
    expect(comp.version).toBe(SELLER_TRUST_FORMULA_VERSION);
    expect(Object.keys(comp).sort()).toEqual(
      ["onTime", "rating", "reliability", "tenure", "version", "volume"].sort(),
    );
    // Admin reads these keys from stored rows: a rename is a version bump.
    expect(Object.keys(comp.rating).sort()).toEqual(
      ["raters", "smoothed", "subScore"].sort(),
    );
    expect(Object.keys(comp.reliability).sort()).toEqual(
      ["eligibleOrders", "failures", "subScore"].sort(),
    );
    expect(Object.keys(comp.onTime).sort()).toEqual(
      ["late", "shipped", "subScore"].sort(),
    );
    expect(Object.keys(comp.volume).sort()).toEqual(
      ["counterparties", "subScore", "transactions"].sort(),
    );
    expect(Object.keys(comp.tenure).sort()).toEqual(
      ["days", "subScore"].sort(),
    );
  });
});

describe("toScoreX100 (round half up, clamped)", () => {
  it.each([
    [3.945, 395],
    [3.94499, 394],
    [4.365, 437],
    [4.355, 436],
    [2.905, 291],
    [0, 0],
    [5, 500],
    [-0.2, 0],
    [5.3, 500],
  ])("%p -> %p", (score, x100) => {
    expect(toScoreX100(score)).toBe(x100);
  });

  // Every exact .xx5 between 0 and 5 rounds up, and the value just below it
  // rounds down. A plain Math.round(score * 100) gets 35 of these 500
  // boundaries wrong (binary noise), so this sweep is what pins the epsilon.
  it("rounds every .xx5 boundary in 0..5 up and the value below it down", () => {
    const wrong: string[] = [];
    for (let k = 0; k < 500; k++) {
      const half = Number(((2 * k + 1) / 200).toFixed(3));
      const below = Number((k / 100 + 0.00499).toFixed(5));
      if (toScoreX100(half) !== k + 1) wrong.push(`${half} -> ${k + 1}`);
      if (toScoreX100(below) !== k) wrong.push(`${below} -> ${k}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("minimum data boundary (D2)", () => {
  it.each([
    [4, 4, null],
    [5, 2, null],
    [5, 3, "scored"],
    [6, 3, "scored"],
  ])("%p transactions from %p counterparties -> %p", (tx, cp, expected) => {
    const { scoreX100 } = computeSellerTrust(
      inputs({ transactions: tx, counterparties: cp }),
    );
    expect(scoreX100 === null ? null : "scored").toBe(expected);
  });
});

describe("sellerTrustLevel thresholds (D3)", () => {
  it.each([
    [null, "new"],
    [500, "excellent"],
    [450, "excellent"],
    [449, "trusted"],
    [400, "trusted"],
    [399, "fair"],
    [300, "fair"],
    [299, "developing"],
    [0, "developing"],
  ])("%p -> %p", (x100, level) => {
    expect(sellerTrustLevel(x100 as number | null)).toBe(level);
  });
});

describe("formula v1 weights (shared with admin)", () => {
  it("computes with the shared weights, one per component, summing to 1", () => {
    expect(TRUST_FORMULA_V1.weights).toBe(SELLER_TRUST_WEIGHTS_V1);
    expect(Object.keys(SELLER_TRUST_WEIGHTS_V1)).toEqual([
      ...SELLER_TRUST_COMPONENTS_V1,
    ]);
    const sum = SELLER_TRUST_COMPONENTS_V1.reduce(
      (acc, key) => acc + SELLER_TRUST_WEIGHTS_V1[key],
      0,
    );
    expect(sum).toBeCloseTo(1, 10);
  });
});
