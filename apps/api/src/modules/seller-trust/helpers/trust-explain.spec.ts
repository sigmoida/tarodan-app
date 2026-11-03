import {
  pickSellerTrustFormulaParams,
  sellerTrustLevel,
  SELLER_TRUST_COMPONENTS_V1,
  type SellerTrustFormulaParams,
} from "@tarodan/types";
import { explainSellerTrust } from "./trust-explain";
import { computeSellerTrust } from "./trust-formula";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";
import { loadV1PinInputs } from "../testing/trust-v1-pin-fixture";

const pinInputs = loadV1PinInputs();

const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

const candidates: Array<[string, SellerTrustFormulaParams]> = [
  ["v1", pickSellerTrustFormulaParams(TRUST_FORMULA_V1)],
  [
    "equal weights, softer priors",
    {
      ...pickSellerTrustFormulaParams(TRUST_FORMULA_V1),
      weights: {
        rating: 0.2,
        reliability: 0.2,
        onTime: 0.2,
        volume: 0.2,
        tenure: 0.2,
      },
      rating: { priorMean: 3.5, priorWeight: 2 },
      reliability: { priorRate: 0.05, priorWeight: 3, zeroAt: 0.4 },
    },
  ],
  [
    "strict minimum, fast saturation",
    {
      ...pickSellerTrustFormulaParams(TRUST_FORMULA_V1),
      volume: { saturation: 20 },
      tenure: { fullAtDays: 365 },
      minimum: { transactions: 20, counterparties: 10 },
    },
  ],
];

describe("explainSellerTrust", () => {
  it.each(candidates)(
    "agrees with computeSellerTrust on every pinned input (%s)",
    (_name, params) => {
      const drift = pinInputs.filter((i) => {
        const e = explainSellerTrust(i, params);
        const r = computeSellerTrust(i, params);
        return (
          e.scoreX100 !== r.scoreX100 ||
          e.level !== sellerTrustLevel(r.scoreX100) ||
          round4(e.rating.smoothed) !== r.components.rating.smoothed ||
          SELLER_TRUST_COMPONENTS_V1.some(
            (key) => round4(e[key].subScore) !== r.components[key].subScore,
          )
        );
      });
      expect(drift).toEqual([]);
    },
  );

  it("defaults to v1", () => {
    for (const i of pinInputs.slice(0, 50)) {
      expect(explainSellerTrust(i)).toEqual(
        explainSellerTrust(i, TRUST_FORMULA_V1),
      );
    }
  });

  it("contributions add up to the unrounded score", () => {
    for (const i of pinInputs) {
      const e = explainSellerTrust(i);
      const sum = SELLER_TRUST_COMPONENTS_V1.reduce(
        (acc, key) => acc + e[key].contribution,
        0,
      );
      expect(sum).toBeCloseTo(e.score, 12);
    }
  });

  it("shows every intermediate value of a worked example (D small and perfect)", () => {
    const e = explainSellerTrust({
      raters: 5,
      sumOfGiverMeans: 25,
      eligibleOrders: 5,
      failures: 0,
      shipped: 5,
      late: 0,
      transactions: 5,
      counterparties: 5,
      tenureDays: 60,
    });
    // R = (5 x 4.0 + 25) / (5 + 5) = 4.5 -> s1 = 0.875
    expect(e.rating).toEqual({
      raters: 5,
      sumOfGiverMeans: 25,
      priorMean: 4,
      priorWeight: 5,
      smoothed: 4.5,
      subScore: 0.875,
      weight: 0.4,
      contribution: expect.closeTo(1.75, 12),
    });
    // f = (0 + 10 x 0.02) / (5 + 10) = 0.01333 -> s2 = 1 - f / 0.25
    expect(e.reliability).toEqual({
      eligibleOrders: 5,
      failures: 0,
      priorRate: 0.02,
      priorWeight: 10,
      zeroAt: 0.25,
      failureRate: expect.closeTo(0.2 / 15, 12),
      subScore: expect.closeTo(1 - 0.2 / 15 / 0.25, 12),
      weight: 0.25,
      contribution: expect.closeTo(5 * 0.25 * (1 - 0.2 / 15 / 0.25), 12),
    });
    // l = (0 + 10 x 0.05) / (5 + 10) = 0.0333 -> s3 = 1 - l / 0.5
    expect(e.onTime).toEqual({
      shipped: 5,
      late: 0,
      priorRate: 0.05,
      priorWeight: 10,
      zeroAt: 0.5,
      lateRate: expect.closeTo(0.5 / 15, 12),
      subScore: expect.closeTo(1 - 0.5 / 15 / 0.5, 12),
      weight: 0.15,
      contribution: expect.closeTo(5 * 0.15 * (1 - 0.5 / 15 / 0.5), 12),
    });
    expect(e.volume).toEqual({
      transactions: 5,
      counterparties: 5,
      saturation: 100,
      subScore: expect.closeTo(Math.log(6) / Math.log(101), 12),
      weight: 0.15,
      contribution: expect.closeTo(
        (5 * 0.15 * Math.log(6)) / Math.log(101),
        12,
      ),
    });
    expect(e.tenure).toEqual({
      days: 60,
      fullAtDays: 730,
      subScore: expect.closeTo(60 / 730, 12),
      weight: 0.05,
      contribution: expect.closeTo((5 * 0.05 * 60) / 730, 12),
    });
    expect(e.score).toBeCloseTo(3.94506, 5);
    expect(e.roundedX100).toBe(395);
    expect(e.scoreX100).toBe(395);
    expect(e.level).toBe("fair");
    expect(e.minimum).toEqual({
      transactions: 5,
      counterparties: 3,
      met: true,
    });
  });

  it("below the minimum keeps the rounded value but has no score", () => {
    const e = explainSellerTrust({
      raters: 2,
      sumOfGiverMeans: 10,
      eligibleOrders: 3,
      failures: 0,
      shipped: 3,
      late: 0,
      transactions: 3,
      counterparties: 3,
      tenureDays: 30,
    });
    expect(e.roundedX100).toBeGreaterThan(0);
    expect(e.scoreX100).toBeNull();
    expect(e.level).toBe("new");
    expect(e.minimum.met).toBe(false);
  });

  it("returns exactly these keys: counts, parameters and terms, no ids or version", () => {
    const e = explainSellerTrust(pinInputs[0]);
    const terms = ["contribution", "subScore", "weight"];
    expect(Object.keys(e).sort()).toEqual(
      [
        ...SELLER_TRUST_COMPONENTS_V1,
        "level",
        "minimum",
        "roundedX100",
        "score",
        "scoreX100",
      ].sort(),
    );
    expect(Object.keys(e.rating).sort()).toEqual(
      [
        ...terms,
        "priorMean",
        "priorWeight",
        "raters",
        "smoothed",
        "sumOfGiverMeans",
      ].sort(),
    );
    expect(Object.keys(e.reliability).sort()).toEqual(
      [
        ...terms,
        "eligibleOrders",
        "failureRate",
        "failures",
        "priorRate",
        "priorWeight",
        "zeroAt",
      ].sort(),
    );
    expect(Object.keys(e.onTime).sort()).toEqual(
      [
        ...terms,
        "late",
        "lateRate",
        "priorRate",
        "priorWeight",
        "shipped",
        "zeroAt",
      ].sort(),
    );
    expect(Object.keys(e.volume).sort()).toEqual(
      [...terms, "counterparties", "saturation", "transactions"].sort(),
    );
    expect(Object.keys(e.tenure).sort()).toEqual(
      [...terms, "days", "fullAtDays"].sort(),
    );
    expect(Object.keys(e.minimum).sort()).toEqual(
      ["counterparties", "met", "transactions"].sort(),
    );
  });
});
