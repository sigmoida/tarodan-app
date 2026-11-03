import {
  pickSellerTrustFormulaParams,
  SELLER_TRUST_COMPONENTS_V1,
  SELLER_TRUST_PARAM_LIMITS,
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
  type SellerTrustParamField,
} from "@tarodan/types";
import { explainSellerTrust } from "./trust-explain";
import {
  computeSellerTrust,
  computeTrustTerms,
  toScoreX100,
} from "./trust-formula";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";
import { DISTINCT_TRUST_CANDIDATE } from "../testing/trust-candidates-fixture";
import { loadV1PinInputs } from "../testing/trust-v1-pin-fixture";
import { trustInputs as inputs } from "../testing/trust-inputs-fixture";

/**
 * The formula takes a parameter set; the default is v1 (AC-F4). The v1 pin
 * itself lives in `trust-formula.v1-pin.spec.ts`; this spec reuses its
 * seeded inputs.
 */
const pinInputs = loadV1PinInputs();

const candidate = (
  change: (p: SellerTrustFormulaParams) => void,
): SellerTrustFormulaParams => {
  const p = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
  change(p);
  expect(validateSellerTrustParams(p)).toEqual([]);
  return p;
};

describe("computeSellerTrust parameters", () => {
  it("v1 passed explicitly, or as a plain copy, equals the default call on every pinned input", () => {
    const v1Copy = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
    const drift = pinInputs.filter((i) => {
      const byDefault = JSON.stringify(computeSellerTrust(i));
      return (
        JSON.stringify(computeSellerTrust(i, TRUST_FORMULA_V1)) !== byDefault ||
        JSON.stringify(computeSellerTrust(i, v1Copy)) !== byDefault
      );
    });
    expect(drift).toEqual([]);
  });

  it("the v1 parameter set is a valid candidate", () => {
    expect(
      validateSellerTrustParams(pickSellerTrustFormulaParams(TRUST_FORMULA_V1)),
    ).toEqual([]);
  });

  it("computes with the candidate's weights", () => {
    // Rating only: no ratings sit on the prior, s1 = (4 - 1) / 4 = 0.75.
    const ratingOnly = candidate((p) => {
      p.weights = {
        rating: 1,
        reliability: 0,
        onTime: 0,
        volume: 0,
        tenure: 0,
      };
    });
    const i = inputs({ transactions: 5, counterparties: 3, tenureDays: 900 });
    expect(computeSellerTrust(i, ratingOnly).scoreX100).toBe(375);
    expect(computeSellerTrust(i).scoreX100).not.toBe(375);
  });

  it("computes with the candidate's priors, zeroAt, saturation and tenure", () => {
    const c = candidate((p) => {
      p.rating = { priorMean: 3, priorWeight: 2 };
      p.reliability = { priorRate: 0.1, priorWeight: 5, zeroAt: 0.5 };
      p.onTime = { priorRate: 0, priorWeight: 1, zeroAt: 1 };
      p.volume = { saturation: 9 };
      p.tenure = { fullAtDays: 100 };
    });
    const comp = computeSellerTrust(
      inputs({ transactions: 9, counterparties: 9, tenureDays: 50 }),
      c,
    ).components;
    expect(comp.rating.smoothed).toBe(3); // prior mean
    expect(comp.rating.subScore).toBe(0.5); // (3 - 1) / 4
    expect(comp.reliability.subScore).toBe(0.8); // 1 - 0.1 / 0.5
    expect(comp.onTime.subScore).toBe(1); // 1 - 0 / 1
    expect(comp.volume.subScore).toBe(1); // ln 10 / ln 10
    expect(comp.tenure.subScore).toBe(0.5); // 50 / 100
  });

  it("applies the candidate's minimum data rule", () => {
    const one = candidate((p) => {
      p.minimum = { transactions: 1, counterparties: 1 };
    });
    const i = inputs({ transactions: 1, counterparties: 1 });
    expect(computeSellerTrust(i).scoreX100).toBeNull();
    expect(computeSellerTrust(i, one).scoreX100).not.toBeNull();
  });

  it("keeps the v1 breakdown shape for a candidate; the lab labels it", () => {
    const c = candidate((p) => {
      p.volume = { saturation: 10 };
    });
    expect(computeSellerTrust(inputs({}), c).components.version).toBe(1);
  });

  it("does not change the parameter set it is given", () => {
    const c = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
    const before = JSON.stringify(c);
    computeSellerTrust(pinInputs[0], c);
    expect(JSON.stringify(c)).toBe(before);
  });
});

/**
 * The formula of `docs/SELLER_TRUST.md`, written out a second time with every
 * constant taken from `p`. It is the oracle for candidates: the v1 pin cannot
 * see a term that reads the wrong parameter where v1 has equal values.
 */
function referenceTrust(i: SellerTrustInputs, p: SellerTrustFormulaParams) {
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  const r =
    (p.rating.priorWeight * p.rating.priorMean + i.sumOfGiverMeans) /
    (p.rating.priorWeight + i.raters);
  const f =
    (i.failures + p.reliability.priorWeight * p.reliability.priorRate) /
    (i.eligibleOrders + p.reliability.priorWeight);
  const l =
    (i.late + p.onTime.priorWeight * p.onTime.priorRate) /
    (i.shipped + p.onTime.priorWeight);
  const s = {
    rating: clamp((r - 1) / 4),
    reliability: clamp(1 - f / p.reliability.zeroAt),
    onTime: clamp(1 - l / p.onTime.zeroAt),
    volume: Math.min(
      1,
      Math.log(1 + i.transactions) / Math.log(1 + p.volume.saturation),
    ),
    tenure: Math.min(1, i.tenureDays / p.tenure.fullAtDays),
  };
  const score =
    5 *
    SELLER_TRUST_COMPONENTS_V1.reduce(
      (acc, key) => acc + p.weights[key] * s[key],
      0,
    );
  const enoughData =
    i.transactions >= p.minimum.transactions &&
    i.counterparties >= p.minimum.counterparties;
  return { smoothed: r, failureRate: f, lateRate: l, s, score, enoughData };
}

describe("a candidate reaches every term of the formula", () => {
  it("is a valid candidate with no value shared with v1", () => {
    expect(validateSellerTrustParams(DISTINCT_TRUST_CANDIDATE)).toEqual([]);
    const v1 = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
    for (const field of Object.keys(
      SELLER_TRUST_PARAM_LIMITS,
    ) as SellerTrustParamField[]) {
      const [group, key] = field.split(".") as [
        keyof SellerTrustFormulaParams,
        string,
      ];
      const read = (p: SellerTrustFormulaParams): number =>
        (p[group] as Record<string, number>)[key];
      expect([field, read(DISTINCT_TRUST_CANDIDATE)]).not.toEqual([
        field,
        read(v1),
      ]);
    }
  });

  it("computes every term from the candidate's own values on every pinned input", () => {
    const drift: string[] = [];
    pinInputs.forEach((i, n) => {
      const t = computeTrustTerms(i, DISTINCT_TRUST_CANDIDATE);
      const ref = referenceTrust(i, DISTINCT_TRUST_CANDIDATE);
      const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12;
      const ok =
        close(t.smoothed, ref.smoothed) &&
        close(t.failureRate, ref.failureRate) &&
        close(t.lateRate, ref.lateRate) &&
        SELLER_TRUST_COMPONENTS_V1.every(
          (key) =>
            close(t.subScores[key], ref.s[key]) &&
            close(
              t.weighted[key],
              DISTINCT_TRUST_CANDIDATE.weights[key] * ref.s[key],
            ),
        ) &&
        close(t.score, ref.score) &&
        t.enoughData === ref.enoughData &&
        computeSellerTrust(i, DISTINCT_TRUST_CANDIDATE).scoreX100 ===
          (ref.enoughData ? toScoreX100(ref.score) : null);
      if (!ok) drift.push(`#${n} ${JSON.stringify(i)}`);
    });
    expect(drift.slice(0, 5)).toEqual([]);
    expect(drift).toHaveLength(0);
  });
});

/** mulberry32, seeded: the same candidates on every run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** v1 with dotted fields replaced. */
function v1With(changes: Partial<Record<SellerTrustParamField, number>>) {
  const p = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
  for (const [field, value] of Object.entries(changes)) {
    const [group, key] = field.split(".");
    (p as unknown as Record<string, Record<string, number>>)[group][key] =
      value;
  }
  return p;
}

/**
 * Valid candidates at the edges of `SELLER_TRUST_PARAM_LIMITS`: every field
 * at its min and at its max, each weight alone at 1, all mins, all maxes,
 * and 40 seeded random sets.
 */
function edgeCandidates(): SellerTrustFormulaParams[] {
  const fields = Object.keys(
    SELLER_TRUST_PARAM_LIMITS,
  ) as SellerTrustParamField[];
  const nonWeights = fields.filter((f) => !f.startsWith("weights."));
  const out: SellerTrustFormulaParams[] = [];
  for (const field of nonWeights) {
    const { min, max } = SELLER_TRUST_PARAM_LIMITS[field];
    for (const value of [min, max]) {
      const pair: Partial<Record<SellerTrustParamField, number>> =
        field === "minimum.transactions" && value === 1
          ? { "minimum.counterparties": 1 }
          : field === "minimum.counterparties" && value === 100
            ? { "minimum.transactions": 100 }
            : {};
      out.push(v1With({ ...pair, [field]: value }));
    }
  }
  for (const only of SELLER_TRUST_COMPONENTS_V1) {
    const weights = Object.fromEntries(
      SELLER_TRUST_COMPONENTS_V1.map((k) => [k, k === only ? 1 : 0]),
    ) as SellerTrustFormulaParams["weights"];
    out.push({ ...pickSellerTrustFormulaParams(TRUST_FORMULA_V1), weights });
  }
  const atEdge = (edge: "min" | "max") =>
    v1With(
      Object.fromEntries(
        nonWeights.map((f) => [f, SELLER_TRUST_PARAM_LIMITS[f][edge]]),
      ),
    );
  out.push(atEdge("min"), atEdge("max"));

  const rand = seededRandom(20_261_104);
  for (let n = 0; n < 40; n++) {
    // Five weights in ten-thousandths that sum to exactly 10,000.
    const cuts = [0, 1, 2, 3]
      .map(() => Math.floor(rand() * 10_001))
      .sort((a, b) => a - b);
    const parts = [...cuts, 10_000].map((c, k) => c - ([0, ...cuts][k] ?? 0));
    const changes: Partial<Record<SellerTrustParamField, number>> = {};
    SELLER_TRUST_COMPONENTS_V1.forEach((key, k) => {
      changes[`weights.${key}`] = parts[k] / 10_000;
    });
    for (const f of nonWeights) {
      const { min, max, integer } = SELLER_TRUST_PARAM_LIMITS[f];
      const x = min + rand() * (max - min);
      changes[f] = integer ? Math.round(x) : Number(x.toFixed(4));
    }
    changes["minimum.counterparties"] = Math.min(
      changes["minimum.counterparties"] as number,
      changes["minimum.transactions"] as number,
    );
    out.push(v1With(changes));
  }
  return out;
}

describe("any valid candidate gives a finite score inside 0..500", () => {
  const candidates = edgeCandidates();
  const extremeInputs: SellerTrustInputs[] = [
    inputs({}),
    inputs({ transactions: 1, counterparties: 1 }),
    inputs({
      raters: 100_000,
      sumOfGiverMeans: 500_000,
      eligibleOrders: 1_000_000,
      shipped: 1_000_000,
      transactions: 1_000_000,
      counterparties: 1_000_000,
      tenureDays: 100_000,
    }),
    inputs({
      raters: 100_000,
      sumOfGiverMeans: 100_000,
      eligibleOrders: 1_000_000,
      failures: 1_000_000,
      transactions: 1_000_000,
      counterparties: 1_000_000,
    }),
  ];

  it("every edge candidate is valid", () => {
    expect(candidates.length).toBeGreaterThan(70);
    const invalid = candidates
      .map((p, n) => [n, validateSellerTrustParams(p)] as const)
      .filter(([, issues]) => issues.length > 0);
    expect(invalid).toEqual([]);
  });

  it("no NaN, no Infinity, sub-scores in 0..1, score in 0..5, explain agrees", () => {
    const bad: string[] = [];
    candidates.forEach((p, n) => {
      for (const i of [...extremeInputs, ...pinInputs]) {
        const t = computeTrustTerms(i, p);
        const r = computeSellerTrust(i, p);
        const e = explainSellerTrust(i, p);
        const subsOk = SELLER_TRUST_COMPONENTS_V1.every(
          (key) =>
            Number.isFinite(t.subScores[key]) &&
            t.subScores[key] >= 0 &&
            t.subScores[key] <= 1 &&
            Number.isFinite(e[key].contribution),
        );
        const scoreOk =
          Number.isFinite(t.score) && t.score >= 0 && t.score <= 5 + 1e-8;
        const x100Ok =
          r.scoreX100 === null ||
          (Number.isInteger(r.scoreX100) &&
            r.scoreX100 >= 0 &&
            r.scoreX100 <= 500);
        if (!subsOk || !scoreOk || !x100Ok || e.scoreX100 !== r.scoreX100) {
          bad.push(`candidate #${n} ${JSON.stringify(i)}`);
          if (bad.length >= 5) return;
        }
      }
    });
    expect(bad).toEqual([]);
  });
});
