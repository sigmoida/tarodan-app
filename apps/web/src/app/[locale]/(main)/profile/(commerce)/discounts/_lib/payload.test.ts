/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import { buildPayload } from "./payload";
import { discountSchema } from "./schema";
import { emptyDiscountForm, type DiscountFormData } from "./types";

/**
 * The discount value and the TL amount fields are text read by the shared TL
 * amount parser. With `type="number"` and `parseFloat`, "1.000" (one thousand
 * to a Turkish user) was 1 TL.
 */
const t = ((key: string) => key) as Translate;
const schema = discountSchema(t);

const form = (patch: Partial<DiscountFormData>): DiscountFormData => ({
  ...emptyDiscountForm(),
  name: "Autumn",
  ...patch,
});

const issues = (values: DiscountFormData) => {
  const result = schema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
};

describe("discount amounts, payload", () => {
  it.each([
    ["1000", 1000],
    ["1250,50", 1250.5],
    ["1250.50", 1250.5],
  ])("sends %j as %j", (raw, amount) => {
    const values = form({
      type: "fixed_amount",
      value: raw,
      minCartValue: raw,
      maxDiscountAmount: raw,
    });
    expect(issues(values)).toEqual({});
    expect(buildPayload(values)).toMatchObject({
      value: amount,
      minCartValue: amount,
      maxDiscountAmount: amount,
    });
  });

  it("omits empty optional amounts and sends a zero value for bogo", () => {
    const payload = buildPayload(
      form({ type: "bogo", value: "", buyQuantity: "2", getQuantity: "1" }),
    );
    expect(payload.value).toBe(0);
    expect(payload.minCartValue).toBeUndefined();
    expect(payload.maxDiscountAmount).toBeUndefined();
  });

  it("sends a comma percentage", () => {
    expect(buildPayload(form({ value: "12,5" })).value).toBe(12.5);
  });
});

describe("discount amounts, refusal", () => {
  it.each(["1.000", "1.250,50"])(
    "refuses %j in every TL field with the shared copy",
    (raw) => {
      expect(
        issues(
          form({
            type: "fixed_amount",
            value: raw,
            minCartValue: raw,
            maxDiscountAmount: raw,
          }),
        ),
      ).toEqual({
        value: "trade.cashFormatRefused",
        minCartValue: "trade.cashFormatRefused",
        maxDiscountAmount: "trade.cashFormatRefused",
      });
    },
  );

  it("refuses a malformed percentage with the generic copy", () => {
    expect(issues(form({ type: "percentage", value: "12,345" }))).toEqual({
      value: "validation.enterValidValue",
    });
  });

  it("ignores the value of a bogo campaign", () => {
    expect(
      issues(
        form({
          type: "bogo",
          value: "1.000",
          buyQuantity: "2",
          getQuantity: "1",
        }),
      ),
    ).toEqual({});
  });

  it("keeps the bulk percentage range on the parsed value", () => {
    const bulk = (value: string) =>
      issues(form({ type: "bulk_quantity", value, minQuantity: "3" }));
    expect(bulk("15,5")).toEqual({});
    expect(bulk("150")).toEqual({ value: "validation.discountPercentRange" });
    expect(bulk("")).toEqual({ value: "validation.discountPercentRange" });
  });
});
