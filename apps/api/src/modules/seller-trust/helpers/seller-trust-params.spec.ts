import {
  isValidSellerTrustParams,
  pickSellerTrustFormulaParams,
  SELLER_TRUST_PARAM_LIMITS,
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
  type SellerTrustParamField,
} from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";

/**
 * The shared candidate validator in `@tarodan/types` (`seller-trust-lab.ts`).
 * The types package has no test runner, so its spec lives next to the
 * formula it guards. The API answers 400 with these issues and the admin
 * form refuses the same values (AC-F3).
 */
const v1 = (): SellerTrustFormulaParams =>
  pickSellerTrustFormulaParams(TRUST_FORMULA_V1);

/** v1 with fields replaced by any value (even a non-number). */
function withFields(changes: Record<string, unknown>): unknown {
  const p = v1() as unknown as Record<string, Record<string, unknown>>;
  for (const [field, value] of Object.entries(changes)) {
    const [group, key] = field.split(".");
    p[group][key] = value;
  }
  return p;
}
const withField = (field: string, value: unknown): unknown =>
  withFields({ [field]: value });

describe("SELLER_TRUST_PARAM_LIMITS", () => {
  it("pins the approved ranges (plan section 4.1)", () => {
    const w = { min: 0, max: 1, integer: false, maxDecimals: 4 };
    const priorWeight = { min: 1, max: 100, integer: true };
    const priorRate = { min: 0, max: 1, integer: false };
    const zeroAt = { min: 0.01, max: 1, integer: false };
    expect(SELLER_TRUST_PARAM_LIMITS).toEqual({
      "weights.rating": w,
      "weights.reliability": w,
      "weights.onTime": w,
      "weights.volume": w,
      "weights.tenure": w,
      "rating.priorMean": { min: 1, max: 5, integer: false },
      "rating.priorWeight": priorWeight,
      "reliability.priorRate": priorRate,
      "reliability.priorWeight": priorWeight,
      "reliability.zeroAt": zeroAt,
      "onTime.priorRate": priorRate,
      "onTime.priorWeight": priorWeight,
      "onTime.zeroAt": zeroAt,
      "volume.saturation": { min: 1, max: 10_000, integer: true },
      "tenure.fullAtDays": { min: 1, max: 3_650, integer: true },
      "minimum.transactions": { min: 1, max: 100, integer: true },
      "minimum.counterparties": { min: 1, max: 100, integer: true },
    });
  });

  it("v1 is inside every limit", () => {
    expect(validateSellerTrustParams(v1())).toEqual([]);
    expect(isValidSellerTrustParams(v1())).toBe(true);
  });
});

describe("validateSellerTrustParams", () => {
  const fields = Object.keys(
    SELLER_TRUST_PARAM_LIMITS,
  ) as SellerTrustParamField[];
  const nonWeights = fields.filter((f) => !f.startsWith("weights."));

  it.each(fields)(
    "%s refuses NaN, Infinity, a string and a missing value",
    (field) => {
      for (const bad of [NaN, Infinity, -Infinity, "0.5", null, undefined]) {
        expect(validateSellerTrustParams(withField(field, bad))).toEqual([
          { field, code: "invalidNumber" },
        ]);
      }
    },
  );

  it.each(nonWeights)(
    "%s accepts its bounds and refuses just outside",
    (field) => {
      const { min, max, integer } = SELLER_TRUST_PARAM_LIMITS[field];
      const step = integer ? 1 : 0.001;
      // The two minimums also bound each other (counterparties <= transactions).
      const pair =
        field === "minimum.transactions"
          ? { "minimum.counterparties": 1 }
          : field === "minimum.counterparties"
            ? { "minimum.transactions": 100 }
            : {};
      expect(
        validateSellerTrustParams(withFields({ ...pair, [field]: min })),
      ).toEqual([]);
      expect(
        validateSellerTrustParams(withFields({ ...pair, [field]: max })),
      ).toEqual([]);
      expect(validateSellerTrustParams(withField(field, min - step))).toEqual([
        { field, code: "outOfRange" },
      ]);
      expect(validateSellerTrustParams(withField(field, max + step))).toEqual([
        { field, code: "outOfRange" },
      ]);
    },
  );

  it.each([
    ["rating.priorWeight", 0],
    ["reliability.priorWeight", 0],
    ["onTime.priorWeight", 0],
    ["reliability.zeroAt", 0],
    ["onTime.zeroAt", 0],
    ["onTime.zeroAt", 0.0099],
    ["volume.saturation", 0],
    ["tenure.fullAtDays", 0],
  ])("refuses %s = %p (a division by zero or nonsense)", (field, value) => {
    expect(validateSellerTrustParams(withField(field, value))).toEqual([
      { field, code: "outOfRange" },
    ]);
  });

  it.each([
    "rating.priorWeight",
    "reliability.priorWeight",
    "onTime.priorWeight",
    "volume.saturation",
    "tenure.fullAtDays",
    "minimum.transactions",
    "minimum.counterparties",
  ])("%s must be an integer", (field) => {
    expect(validateSellerTrustParams(withField(field, 2.5))).toEqual([
      { field, code: "notInteger" },
    ]);
  });

  describe("weights", () => {
    const weights = (w: SellerTrustFormulaParams["weights"]): unknown => ({
      ...v1(),
      weights: w,
    });

    it("accepts any split that sums to 1, including a single weight of 1", () => {
      expect(
        validateSellerTrustParams(
          weights({
            rating: 1,
            reliability: 0,
            onTime: 0,
            volume: 0,
            tenure: 0,
          }),
        ),
      ).toEqual([]);
      // 0.1 + 0.2 + ... carries binary noise; within 1e-9 it is 1.
      expect(
        validateSellerTrustParams(
          weights({
            rating: 0.1,
            reliability: 0.2,
            onTime: 0.3,
            volume: 0.3,
            tenure: 0.1,
          }),
        ),
      ).toEqual([]);
    });

    it("refuses weights that do not sum to 1", () => {
      expect(
        validateSellerTrustParams(
          weights({
            rating: 0.4,
            reliability: 0.25,
            onTime: 0.15,
            volume: 0.15,
            tenure: 0.04,
          }),
        ),
      ).toEqual([{ field: "weights", code: "weightsSum" }]);
      expect(
        validateSellerTrustParams(
          weights({
            rating: 0.4,
            reliability: 0.25,
            onTime: 0.15,
            volume: 0.15,
            tenure: 0.0501,
          }),
        ),
      ).toEqual([{ field: "weights", code: "weightsSum" }]);
    });

    it("refuses a weight outside 0..1, and checks the sum only when every weight is valid", () => {
      expect(
        validateSellerTrustParams(
          weights({
            rating: 1.2,
            reliability: -0.2,
            onTime: 0,
            volume: 0,
            tenure: 0,
          }),
        ),
      ).toEqual([
        { field: "weights.rating", code: "outOfRange" },
        { field: "weights.reliability", code: "outOfRange" },
      ]);
    });

    it("allows at most 4 decimals", () => {
      expect(
        validateSellerTrustParams(
          weights({
            rating: 0.40005,
            reliability: 0.24995,
            onTime: 0.15,
            volume: 0.15,
            tenure: 0.05,
          }),
        ),
      ).toEqual([
        { field: "weights.rating", code: "tooManyDecimals" },
        { field: "weights.reliability", code: "tooManyDecimals" },
      ]);
      expect(
        validateSellerTrustParams(
          weights({
            rating: 0.4005,
            reliability: 0.2495,
            onTime: 0.15,
            volume: 0.15,
            tenure: 0.05,
          }),
        ),
      ).toEqual([]);
    });
  });

  it("refuses minimum counterparties above minimum transactions", () => {
    const p = { ...v1(), minimum: { transactions: 4, counterparties: 5 } };
    expect(validateSellerTrustParams(p)).toEqual([
      { field: "minimum.counterparties", code: "aboveTransactions" },
    ]);
    expect(
      validateSellerTrustParams({
        ...v1(),
        minimum: { transactions: 4, counterparties: 4 },
      }),
    ).toEqual([]);
  });

  it("refuses the definitions a candidate may not change (D3): version, windows, grace, cap", () => {
    expect(validateSellerTrustParams(TRUST_FORMULA_V1)).toEqual([
      { field: "version", code: "unknownField" },
      { field: "windows", code: "unknownField" },
      { field: "onTime.graceMinutes", code: "unknownField" },
      { field: "volume.perCounterpartyCap", code: "unknownField" },
    ]);
  });

  it("refuses keys an object only inherits (constructor, __proto__, toString)", () => {
    // JSON.parse makes `__proto__` an own key, as a request body would.
    const body = JSON.parse(
      JSON.stringify(v1()).replace(
        /^\{/,
        '{"constructor":1,"__proto__":{},"toString":2,',
      ),
    ) as unknown;
    expect(validateSellerTrustParams(body)).toEqual([
      { field: "constructor", code: "unknownField" },
      { field: "__proto__", code: "unknownField" },
      { field: "toString", code: "unknownField" },
    ]);
    const nested = JSON.parse(
      JSON.stringify(v1()).replace(
        '"tenure":{',
        '"tenure":{"hasOwnProperty":1,',
      ),
    ) as unknown;
    expect(validateSellerTrustParams(nested)).toEqual([
      { field: "tenure.hasOwnProperty", code: "unknownField" },
    ]);
  });

  it("refuses a set or a group that is not an object", () => {
    for (const bad of [null, undefined, 1, "x", []]) {
      expect(validateSellerTrustParams(bad)).toEqual([
        { field: "", code: "notAnObject" },
      ]);
    }
    const { tenure: _tenure, ...noTenure } = v1();
    expect(validateSellerTrustParams(noTenure)).toEqual([
      { field: "tenure", code: "notAnObject" },
    ]);
    expect(validateSellerTrustParams({ ...v1(), weights: [1] })).toEqual([
      { field: "weights", code: "notAnObject" },
    ]);
  });

  it("reports every issue at once, one per field", () => {
    const p = {
      ...v1(),
      rating: { priorMean: 6, priorWeight: 0 },
      onTime: { priorRate: 0.05, priorWeight: 10, zeroAt: NaN },
    };
    expect(validateSellerTrustParams(p)).toEqual([
      { field: "rating.priorMean", code: "outOfRange" },
      { field: "rating.priorWeight", code: "outOfRange" },
      { field: "onTime.zeroAt", code: "invalidNumber" },
    ]);
    expect(isValidSellerTrustParams(p)).toBe(false);
  });
});

describe("pickSellerTrustFormulaParams", () => {
  it("copies exactly the parameter fields with their values", () => {
    const p = v1();
    expect(p).toEqual({
      weights: TRUST_FORMULA_V1.weights,
      rating: TRUST_FORMULA_V1.rating,
      reliability: TRUST_FORMULA_V1.reliability,
      onTime: { priorRate: 0.05, priorWeight: 10, zeroAt: 0.5 },
      volume: { saturation: 100 },
      tenure: TRUST_FORMULA_V1.tenure,
      minimum: TRUST_FORMULA_V1.minimum,
    });
    expect(p.weights).not.toBe(TRUST_FORMULA_V1.weights);
  });
});
