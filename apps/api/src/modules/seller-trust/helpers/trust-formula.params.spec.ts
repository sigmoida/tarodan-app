import {
  pickSellerTrustFormulaParams,
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
} from "@tarodan/types";
import { computeSellerTrust } from "./trust-formula";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";
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
