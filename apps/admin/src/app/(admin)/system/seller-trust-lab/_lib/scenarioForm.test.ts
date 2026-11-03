import { describe, expect, it } from "vitest";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import {
  EMPTY_SCENARIO,
  formToInputs,
  goldenName,
  inputsToForm,
  scenarioSchema,
  validInputs,
} from "./scenarioForm";

const t = fakeT as unknown as Translate;

const inputs = {
  raters: 12,
  sumOfGiverMeans: 57.6,
  eligibleOrders: 15,
  failures: 1,
  shipped: 14,
  late: 2,
  transactions: 25,
  counterparties: 20,
  tenureDays: 100,
};

function errors(values: typeof EMPTY_SCENARIO) {
  const result = scenarioSchema(t).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((i) => [i.path.join("."), i.message]),
  );
}

describe("scenario form", () => {
  it("turns the sum of giver means into an average and back without drift", () => {
    const form = inputsToForm(inputs);
    expect(form.meanRating).toBe("4.8");
    expect(formToInputs(form)).toEqual(inputs);
    expect(validInputs(form)).toEqual(inputs);
  });

  it("accepts an empty seller", () => {
    expect(validInputs(EMPTY_SCENARIO)).not.toBeNull();
    expect(errors(EMPTY_SCENARIO)).toEqual({});
  });

  it("puts a rating outside 1 to 5 on the average field", () => {
    const found = errors({ ...inputsToForm(inputs), meanRating: "7" });
    expect(found.meanRating).toContain("params.errors.range");
    expect(found.meanRating).toContain('"max":"5"');
  });

  it("refuses failures above the orders counted", () => {
    const found = errors({ ...inputsToForm(inputs), failures: "99" });
    expect(found.failures).toContain("scenario.errors.aboveEligibleOrders");
  });

  it("refuses a blank or negative count", () => {
    expect(errors({ ...inputsToForm(inputs), late: "" }).late).toContain(
      "scenario.errors.invalidNumber",
    );
    expect(errors({ ...inputsToForm(inputs), late: "-1" }).late).toContain(
      "scenario.errors.negative",
    );
  });

  it("names a scenario by its catalog key, or by its API key when unknown", () => {
    expect(goldenName("aNew", t)).toBe(
      "admin.system.sellerTrustLab.golden.name.newSeller",
    );
    expect(goldenName("somethingNew", t)).toBe("somethingNew");
  });
});
