import { sellerTrustLevel, SELLER_TRUST_FORMULA_VERSION } from "@tarodan/types";
import {
  computeSellerTrust,
  toScoreX100,
  type SellerTrustInputs,
} from "./trust-formula";

/**
 * Pins seller trust formula v1 to the worked examples of the plan
 * (tarodan-ops plans/2026-10-21-seller-trust-score.md, section 3.6) and to
 * `docs/SELLER_TRUST.md`. A failing case here is a formula change: bump
 * SELLER_TRUST_FORMULA_VERSION and get the product decision first.
 */
const inputs = (over: Partial<SellerTrustInputs>): SellerTrustInputs => ({
  raters: 0,
  sumOfGiverMeans: 0,
  eligibleOrders: 0,
  failures: 0,
  shipped: 0,
  late: 0,
  transactions: 0,
  counterparties: 0,
  tenureDays: 0,
  ...over,
});

describe("computeSellerTrust (formula v1)", () => {
  const cases: Array<{
    name: string;
    in: Partial<SellerTrustInputs>;
    subs: [number, number, number, number, number];
    scoreX100: number;
    level: string;
  }> = [
    {
      name: "D small and perfect",
      in: {
        raters: 5,
        sumOfGiverMeans: 25,
        eligibleOrders: 5,
        shipped: 5,
        transactions: 5,
        counterparties: 5,
        tenureDays: 60,
      },
      subs: [0.875, 0.9467, 0.9333, 0.3882, 0.0822],
      scoreX100: 395,
      level: "fair",
    },
    {
      name: "E steady",
      in: {
        raters: 12,
        sumOfGiverMeans: 12 * 4.8,
        eligibleOrders: 15,
        shipped: 15,
        late: 1,
        transactions: 15,
        counterparties: 12,
        tenureDays: 200,
      },
      subs: [0.8912, 0.968, 0.88, 0.6008, 0.274],
      scoreX100: 417,
      level: "trusted",
    },
    {
      name: "B good",
      in: {
        raters: 25,
        sumOfGiverMeans: 25 * 4.8,
        eligibleOrders: 45,
        failures: 1,
        shipped: 44,
        late: 3,
        transactions: 40,
        counterparties: 30,
        tenureDays: 400,
      },
      subs: [0.9167, 0.9127, 0.8704, 0.8047, 0.5479],
      scoreX100: 437,
      level: "trusted",
    },
    {
      name: "F veteran",
      in: {
        raters: 100,
        sumOfGiverMeans: 100 * 4.9,
        eligibleOrders: 150,
        failures: 1,
        shipped: 148,
        late: 4,
        transactions: 100,
        counterparties: 100,
        tenureDays: 1000,
      },
      subs: [0.9643, 0.97, 0.943, 1, 1],
      scoreX100: 485,
      level: "excellent",
    },
    {
      name: "C problem",
      in: {
        raters: 12,
        sumOfGiverMeans: 12 * 3.9,
        eligibleOrders: 30,
        failures: 6,
        shipped: 24,
        late: 8,
        transactions: 20,
        counterparties: 15,
        tenureDays: 300,
      },
      subs: [0.7324, 0.38, 0.5, 0.6597, 0.411],
      scoreX100: 291,
      level: "developing",
    },
  ];

  it.each(cases)("$name scores $scoreX100 ($level)", (c) => {
    const result = computeSellerTrust(inputs(c.in));
    const comp = result.components;
    expect([
      comp.rating.subScore,
      comp.reliability.subScore,
      comp.onTime.subScore,
      comp.volume.subScore,
      comp.tenure.subScore,
    ]).toEqual(c.subs.map((s) => expect.closeTo(s, 4)));
    expect(result.scoreX100).toBe(c.scoreX100);
    expect(sellerTrustLevel(result.scoreX100)).toBe(c.level);
  });

  describe("minimum data (D2)", () => {
    it("A new: 3 sales and two 5-star ratings have no score", () => {
      const result = computeSellerTrust(
        inputs({
          raters: 2,
          sumOfGiverMeans: 10,
          eligibleOrders: 3,
          shipped: 3,
          transactions: 3,
          counterparties: 3,
          tenureDays: 30,
        }),
      );
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
