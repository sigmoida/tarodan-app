import {
  parseSellerTrustInputs,
  parseSellerTrustParams,
  pickSellerTrustFormulaParams,
  SELLER_TRUST_INPUT_FIELDS,
  SELLER_TRUST_PARAM_LIMITS,
  validateSellerTrustInputs,
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
} from "@tarodan/types";
import { trustInputs } from "../testing/trust-inputs-fixture";
import { explainSellerTrust } from "./trust-explain";
import { computeSellerTrust } from "./trust-formula";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";
import { SELLER_TRUST_GOLDEN_V1 } from "./trust-golden-v1";

/**
 * The shared scenario-input validator and the once-only parse helpers in
 * `@tarodan/types` (`seller-trust-lab.ts`). The types package has no test
 * runner, so the spec lives next to the formula it protects: a value the
 * validator accepts never makes the formula divide by zero or return NaN.
 */
const valid = (): SellerTrustInputs =>
  trustInputs({
    raters: 4,
    sumOfGiverMeans: 18,
    eligibleOrders: 10,
    failures: 1,
    shipped: 9,
    late: 2,
    transactions: 8,
    counterparties: 6,
    tenureDays: 300,
  });

const issuesOf = (over: Record<string, unknown>) =>
  validateSellerTrustInputs({ ...valid(), ...over });

describe("validateSellerTrustInputs", () => {
  it("lists every formula input once, the rating sum as the only fraction", () => {
    expect(SELLER_TRUST_INPUT_FIELDS).toEqual({
      raters: { integer: true },
      sumOfGiverMeans: { integer: false },
      eligibleOrders: { integer: true },
      failures: { integer: true },
      shipped: { integer: true },
      late: { integer: true },
      transactions: { integer: true },
      counterparties: { integer: true },
      tenureDays: { integer: true },
    });
    expect(Object.keys(SELLER_TRUST_INPUT_FIELDS).sort()).toEqual(
      Object.keys(trustInputs()).sort(),
    );
  });

  it("accepts every golden scenario and the empty seller", () => {
    for (const g of SELLER_TRUST_GOLDEN_V1) {
      expect({
        key: g.key,
        issues: validateSellerTrustInputs(g.inputs),
      }).toEqual({ key: g.key, issues: [] });
    }
    expect(validateSellerTrustInputs(trustInputs())).toEqual([]);
  });

  it.each([
    ["null", null],
    ["an array", [1, 2]],
    ["a string", "inputs"],
    ["undefined", undefined],
  ])("refuses %s as the inputs", (_name, value) => {
    expect(validateSellerTrustInputs(value)).toEqual([
      { field: "", code: "notAnObject" },
    ]);
  });

  it("names an unknown key (a definition is not an input)", () => {
    expect(issuesOf({ perCounterpartyCap: 3, constructor: 1 })).toEqual([
      { field: "perCounterpartyCap", code: "unknownField" },
      { field: "constructor", code: "unknownField" },
    ]);
  });

  it.each(Object.keys(SELLER_TRUST_INPUT_FIELDS))(
    "refuses a missing, non-numeric, NaN or infinite %s",
    (field) => {
      for (const value of [undefined, null, "3", NaN, Infinity, -Infinity]) {
        expect(issuesOf({ [field]: value })).toContainEqual({
          field,
          code: "invalidNumber",
        });
      }
    },
  );

  it.each(
    Object.entries(SELLER_TRUST_INPUT_FIELDS)
      .filter(([, rule]) => rule.integer)
      .map(([field]) => field),
  )("refuses a fractional or unsafe count for %s", (field) => {
    expect(issuesOf({ [field]: 1.5 })).toContainEqual({
      field,
      code: "notInteger",
    });
    expect(issuesOf({ [field]: 2 ** 53 })).toContainEqual({
      field,
      code: "notInteger",
    });
  });

  it.each(Object.keys(SELLER_TRUST_INPUT_FIELDS))(
    "refuses a negative %s",
    (field) => {
      expect(issuesOf({ [field]: -1 })).toContainEqual({
        field,
        code: "negative",
      });
    },
  );

  it("keeps the rating sum between 1 and 5 per rater", () => {
    const sum = (raters: number, sumOfGiverMeans: number) =>
      issuesOf({ raters, sumOfGiverMeans });
    const out = [{ field: "sumOfGiverMeans", code: "ratingSumOutOfRange" }];
    expect(sum(4, 4)).toEqual([]);
    expect(sum(4, 20)).toEqual([]);
    expect(sum(12, 12 * 4.8)).toEqual([]);
    expect(sum(0, 0)).toEqual([]);
    expect(sum(4, 3.99)).toEqual(out);
    expect(sum(4, 20.01)).toEqual(out);
    expect(sum(0, 0.5)).toEqual(out);
  });

  it("keeps failures and shipped within eligible orders, late within shipped", () => {
    expect(issuesOf({ failures: 11 })).toEqual([
      { field: "failures", code: "aboveEligibleOrders" },
    ]);
    expect(issuesOf({ shipped: 11, late: 0 })).toEqual([
      { field: "shipped", code: "aboveEligibleOrders" },
    ]);
    expect(issuesOf({ late: 10 })).toEqual([
      { field: "late", code: "aboveShipped" },
    ]);
  });

  it("allows failures + shipped above eligible orders (a refunded shipped order is both)", () => {
    expect(
      issuesOf({ eligibleOrders: 10, failures: 2, shipped: 10, late: 0 }),
    ).toEqual([]);
  });

  it("keeps counterparties within transactions", () => {
    expect(issuesOf({ counterparties: 9 })).toEqual([
      { field: "counterparties", code: "aboveTransactions" },
    ]);
  });

  it("skips a relation whose operand is already invalid (one issue per cause)", () => {
    expect(issuesOf({ eligibleOrders: NaN })).toEqual([
      { field: "eligibleOrders", code: "invalidNumber" },
    ]);
  });
});

/** Deterministic PRNG (mulberry32) so the sweep is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("accepted inputs and params never give NaN", () => {
  const extremes: SellerTrustFormulaParams[] = [
    pickSellerTrustFormulaParams(TRUST_FORMULA_V1),
    {
      weights: { rating: 1, reliability: 0, onTime: 0, volume: 0, tenure: 0 },
      rating: { priorMean: 1, priorWeight: 1 },
      reliability: { priorRate: 1, priorWeight: 1, zeroAt: 0.01 },
      onTime: { priorRate: 0, priorWeight: 1, zeroAt: 0.01 },
      volume: { saturation: 1 },
      tenure: { fullAtDays: 1 },
      minimum: { transactions: 1, counterparties: 1 },
    },
    {
      weights: { rating: 0, reliability: 0, onTime: 0, volume: 0, tenure: 1 },
      rating: { priorMean: 5, priorWeight: 100 },
      reliability: { priorRate: 0, priorWeight: 100, zeroAt: 1 },
      onTime: { priorRate: 1, priorWeight: 100, zeroAt: 1 },
      volume: {
        saturation: SELLER_TRUST_PARAM_LIMITS["volume.saturation"].max,
      },
      tenure: {
        fullAtDays: SELLER_TRUST_PARAM_LIMITS["tenure.fullAtDays"].max,
      },
      minimum: { transactions: 100, counterparties: 100 },
    },
  ];

  it("uses only params the shared validator accepts", () => {
    for (const p of extremes) expect(validateSellerTrustParams(p)).toEqual([]);
  });

  it("computes a finite score for 500 random valid inputs under extreme valid params", () => {
    const rnd = prng(20261103);
    const int = (max: number) => Math.floor(rnd() * (max + 1));
    for (let n = 0; n < 500; n++) {
      const raters = n % 7 === 0 ? 0 : int(500);
      const eligibleOrders = n % 5 === 0 ? 0 : int(1000);
      const shipped = int(eligibleOrders);
      const transactions = n % 11 === 0 ? 0 : int(2000);
      const inputs: SellerTrustInputs = {
        raters,
        sumOfGiverMeans: raters * (1 + 4 * rnd()),
        eligibleOrders,
        failures: int(eligibleOrders),
        shipped,
        late: int(shipped),
        transactions,
        counterparties: int(transactions),
        tenureDays: int(5000),
      };
      expect(validateSellerTrustInputs(inputs)).toEqual([]);
      for (const p of extremes) {
        const e = explainSellerTrust(inputs, p);
        const r = computeSellerTrust(inputs, p);
        for (const x of [e.score, e.roundedX100, e.rating.smoothed]) {
          expect(Number.isFinite(x)).toBe(true);
        }
        expect(r.scoreX100 === null || Number.isInteger(r.scoreX100)).toBe(
          true,
        );
      }
    }
  });
});

describe("parseSellerTrustInputs and parseSellerTrustParams", () => {
  it("returns a validated plain copy, not the request object", () => {
    const raw = valid();
    const parsed = parseSellerTrustInputs(raw);
    expect(parsed).toEqual({ ok: true, value: raw });
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.value).not.toBe(raw);
  });

  it("reads a getter once, so the checked value is the computed value", () => {
    let reads = 0;
    const raw = { ...valid() } as Record<string, unknown>;
    Object.defineProperty(raw, "raters", {
      enumerable: true,
      get: () => (++reads === 1 ? 4 : NaN),
    });
    const parsed = parseSellerTrustInputs(raw);
    expect(reads).toBe(1);
    expect(parsed).toEqual({ ok: true, value: valid() });
  });

  it("ignores inherited keys and drops the prototype", () => {
    const raw = Object.assign(Object.create({ late: 99, extra: 1 }), valid());
    const parsed = parseSellerTrustInputs(raw);
    expect(parsed.ok && Object.getPrototypeOf(parsed.value)).toBe(
      Object.prototype,
    );
    expect(parsed).toEqual({ ok: true, value: valid() });
  });

  it("refuses NaN, which JSON cannot carry, as an invalid number", () => {
    expect(parseSellerTrustInputs({ ...valid(), late: NaN })).toEqual({
      ok: false,
      issues: [{ field: "late", code: "invalidNumber" }],
    });
  });

  it.each([
    ["undefined", undefined],
    [
      "a cycle",
      (() => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return o;
      })(),
    ],
    ["a BigInt", { raters: BigInt(1) }],
  ])("refuses %s as not an object", (_name, raw) => {
    expect(parseSellerTrustInputs(raw)).toEqual({
      ok: false,
      issues: [{ field: "", code: "notAnObject" }],
    });
    expect(parseSellerTrustParams(raw)).toEqual({
      ok: false,
      issues: [{ field: "", code: "notAnObject" }],
    });
  });

  it("parses the v1 params and refuses a definition smuggled into them", () => {
    const v1 = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
    expect(parseSellerTrustParams(v1)).toEqual({ ok: true, value: v1 });
    expect(
      parseSellerTrustParams({
        ...v1,
        onTime: { ...v1.onTime, graceMinutes: 0 },
      }),
    ).toEqual({
      ok: false,
      issues: [{ field: "onTime.graceMinutes", code: "unknownField" }],
    });
  });
});
