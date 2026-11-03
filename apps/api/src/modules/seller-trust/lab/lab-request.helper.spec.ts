import { BadRequestException } from "@nestjs/common";
import { pickSellerTrustFormulaParams } from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "../helpers/trust-formula.constants";
import { SELLER_TRUST_GOLDEN_V1 } from "../helpers/trust-golden-v1";
import {
  candidateParamsHash,
  normalisePopulationFilters,
  parseCandidateParams,
  parseOptionalCandidateParams,
  parseScenarioInputs,
} from "./lab-request.helper";

const v1 = () => pickSellerTrustFormulaParams(TRUST_FORMULA_V1);

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).getResponse();
  }
  throw new Error("expected a 400");
};

describe("parseCandidateParams", () => {
  it("returns a validated copy of a valid candidate", () => {
    const raw = v1();
    const parsed = parseCandidateParams(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
  });

  it.each([
    [
      "the sum of weights",
      { ...v1(), weights: { ...v1().weights, rating: 0.5 } },
      "weights",
    ],
    [
      "a prior weight of 0",
      { ...v1(), rating: { priorMean: 4, priorWeight: 0 } },
      "rating.priorWeight",
    ],
    [
      "a zeroAt of 0",
      { ...v1(), onTime: { ...v1().onTime, zeroAt: 0 } },
      "onTime.zeroAt",
    ],
    [
      "the late grace",
      { ...v1(), onTime: { ...v1().onTime, graceMinutes: 0 } },
      "onTime.graceMinutes",
    ],
    [
      "the per-counterparty cap",
      { ...v1(), volume: { saturation: 100, perCounterpartyCap: 5 } },
      "volume.perCounterpartyCap",
    ],
    ["the windows", { ...v1(), windows: { ratingDays: 1 } }, "windows"],
    ["a formula version", { ...v1(), version: 2 }, "version"],
    [
      "a string number",
      { ...v1(), tenure: { fullAtDays: "730" } },
      "tenure.fullAtDays",
    ],
    ["no object", "v1", "params"],
    ["null when required", null, "params"],
  ])("refuses %s with invalidParams naming the field", (_name, raw, field) => {
    expect(refusal(() => parseCandidateParams(raw))).toEqual({
      i18nKey: "server.sellerTrustLab.invalidParams",
      i18nParams: { field },
    });
  });

  it("treats absent or null optional params as none", () => {
    expect(parseOptionalCandidateParams(undefined)).toBeNull();
    expect(parseOptionalCandidateParams(null)).toBeNull();
    expect(parseOptionalCandidateParams(v1())).toEqual(v1());
    expect(() => parseOptionalCandidateParams({})).toThrow(BadRequestException);
  });
});

describe("parseScenarioInputs", () => {
  it("returns a validated copy of valid inputs", () => {
    const inputs = SELLER_TRUST_GOLDEN_V1[2].inputs;
    expect(parseScenarioInputs(inputs)).toEqual(inputs);
  });

  it("refuses invalid inputs with invalidInputs naming the field", () => {
    expect(
      refusal(() =>
        parseScenarioInputs({ ...SELLER_TRUST_GOLDEN_V1[2].inputs, late: 99 }),
      ),
    ).toEqual({
      i18nKey: "server.sellerTrustLab.invalidInputs",
      i18nParams: { field: "late" },
    });
    expect(refusal(() => parseScenarioInputs(undefined))).toEqual({
      i18nKey: "server.sellerTrustLab.invalidInputs",
      i18nParams: { field: "inputs" },
    });
  });
});

describe("normalisePopulationFilters", () => {
  it("drops an empty level list and duplicate levels", () => {
    expect(normalisePopulationFilters(undefined)).toEqual({});
    expect(normalisePopulationFilters({ levels: [] })).toEqual({});
    expect(
      normalisePopulationFilters({
        levels: ["fair", "fair", "new"],
        minTransactions: 0,
      }),
    ).toEqual({ levels: ["fair", "new"], minTransactions: 0 });
  });
});

describe("candidateParamsHash", () => {
  it("is stable for one candidate whatever the key order, and differs for another", () => {
    const a = v1();
    const { minimum, ...rest } = a;
    const reordered = { minimum, ...rest };
    expect(candidateParamsHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(candidateParamsHash(reordered)).toBe(candidateParamsHash(a));
    expect(candidateParamsHash({ ...a, tenure: { fullAtDays: 365 } })).not.toBe(
      candidateParamsHash(a),
    );
  });
});
