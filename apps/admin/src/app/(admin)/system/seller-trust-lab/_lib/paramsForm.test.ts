import { describe, expect, it } from "vitest";
import { validateSellerTrustParams } from "@tarodan/types";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import { V1_PARAMS } from "./fixtures";
import {
  differsFromV1,
  formToParams,
  parseFormNumber,
  paramsSchema,
  paramsToForm,
  validParams,
  weightsTotal,
} from "./paramsForm";

const t = fakeT as unknown as Translate;

/** Messages by field path for a form value set. */
function errors(values: ReturnType<typeof paramsToForm>) {
  const result = paramsSchema(t).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((i) => [i.path.join("."), i.message]),
  );
}

describe("candidate parameter form", () => {
  it("round-trips v1 through the form text and passes the shared validator", () => {
    const form = paramsToForm(V1_PARAMS);
    expect(form.weights.rating).toBe("0.4");
    expect(formToParams(form)).toEqual(V1_PARAMS);
    expect(validateSellerTrustParams(formToParams(form))).toEqual([]);
    expect(errors(form)).toEqual({});
    expect(validParams(form)).toEqual(V1_PARAMS);
  });

  it("reads a decimal comma and treats an empty field as invalid, not 0", () => {
    expect(parseFormNumber("0,25")).toBe(0.25);
    expect(parseFormNumber("  ")).toBeNaN();
    const form = paramsToForm(V1_PARAMS);
    form.rating.priorMean = "";
    expect(validParams(form)).toBeNull();
    expect(Object.keys(errors(form))).toContain("rating.priorMean");
  });

  it("puts a weights total other than 1 on the weights line, with the total", () => {
    const form = paramsToForm(V1_PARAMS);
    form.weights.rating = "0.5";
    expect(weightsTotal(form.weights)).toBeCloseTo(1.1);
    const found = errors(form);
    expect(found.weightsSum).toContain("params.errors.weightsSum");
    expect(found.weightsSum).toContain('"sum":"1,1000"');
    expect(validParams(form)).toBeNull();
  });

  it("names the field and the allowed range for a value out of range", () => {
    const form = paramsToForm(V1_PARAMS);
    form.rating.priorMean = "9";
    const message = errors(form)["rating.priorMean"];
    expect(message).toContain("params.errors.range");
    expect(message).toContain('"min":"1,00"');
    expect(message).toContain('"max":"5,00"');
  });

  it("asks for a whole number where the limit is an integer", () => {
    const form = paramsToForm(V1_PARAMS);
    form.volume.saturation = "50.5";
    expect(errors(form)["volume.saturation"]).toContain(
      "params.errors.integer",
    );
  });

  it("refuses more distinct counterparties than transactions", () => {
    const form = paramsToForm(V1_PARAMS);
    form.minimum.transactions = "3";
    form.minimum.counterparties = "5";
    expect(errors(form)["minimum.counterparties"]).toContain(
      "params.errors.counterparties",
    );
  });

  it("detects a candidate that differs from v1", () => {
    expect(differsFromV1(V1_PARAMS, V1_PARAMS)).toBe(false);
    expect(
      differsFromV1({ ...V1_PARAMS, volume: { saturation: 60 } }, V1_PARAMS),
    ).toBe(true);
  });
});
