/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import { buildPayload, fromDiscount } from "./payload";
import { discountSchema } from "./schema";
import {
  emptyDiscountForm,
  type Discount,
  type DiscountFormData,
} from "./types";

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
    // The default "10" stays in the hidden field after switching to bogo.
    const payload = buildPayload(
      form({ type: "bogo", value: "10", buyQuantity: "2", getQuantity: "1" }),
    );
    expect(payload.value).toBe(0);
    expect(payload.minCartValue).toBeUndefined();
    expect(payload.maxDiscountAmount).toBeUndefined();
  });

  it.each(["0", "0,00", ","])(
    "omits a zero optional amount %j instead of sending a 0 TL cap",
    (raw) => {
      // A 0 cap would clip every discount to nothing in the cart.
      const payload = buildPayload(
        form({ minCartValue: raw, maxDiscountAmount: raw }),
      );
      expect(payload.minCartValue).toBeUndefined();
      expect(payload.maxDiscountAmount).toBeUndefined();
    },
  );

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

  it.each(["percentage", "bulk_quantity"] as const)(
    "keeps a %s value within 0-100",
    (type) => {
      // The API range-checks only bulk campaigns; 150% would exceed the subtotal.
      const percent = (value: string) =>
        issues(form({ type, value, minQuantity: "3" }));
      expect(percent("100")).toEqual({});
      expect(percent("0,01")).toEqual({});
      expect(percent("100,01")).toEqual({
        value: "validation.discountPercentRange",
      });
      expect(percent("150")).toEqual({
        value: "validation.discountPercentRange",
      });
      expect(percent("0")).toEqual({
        value: "validation.discountPercentRange",
      });
    },
  );

  it("asks for a fixed amount above zero", () => {
    expect(issues(form({ type: "fixed_amount", value: "" }))).toEqual({
      value: "validation.enterValidValue",
    });
    expect(issues(form({ type: "fixed_amount", value: "0,00" }))).toEqual({
      value: "validation.enterValidValue",
    });
  });

  it("keeps the bulk percentage range on the parsed value", () => {
    const bulk = (value: string) =>
      issues(form({ type: "bulk_quantity", value, minQuantity: "3" }));
    expect(bulk("15,5")).toEqual({});
    expect(bulk("150")).toEqual({ value: "validation.discountPercentRange" });
    expect(bulk("")).toEqual({ value: "validation.discountPercentRange" });
  });
});

describe("discount amounts, edit prefill", () => {
  const saved = (patch: Partial<Discount>): Discount => ({
    id: "d1",
    code: "AUTUMN",
    name: "Autumn",
    description: null,
    type: "fixed_amount",
    value: 1250.5,
    scope: "seller",
    targetProductIds: [],
    minCartValue: 1000,
    maxDiscountAmount: null,
    usageLimitTotal: null,
    usageLimitPerUser: 1,
    usedCount: 0,
    isStackable: false,
    priority: 0,
    isActive: true,
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: "2026-10-31T00:00:00.000Z",
    createdAt: "2026-09-30T00:00:00.000Z",
    isCurrentlyValid: true,
    remainingUsage: null,
    ...patch,
  });

  it("shows saved amounts with a decimal comma and no grouping", () => {
    const values = fromDiscount(
      saved({ value: 1250.5, minCartValue: 1000, maxDiscountAmount: 0.5 }),
    );
    expect(values).toMatchObject({
      value: "1250,50",
      minCartValue: "1000",
      maxDiscountAmount: "0,50",
    });
  });

  it("reads a decimal string the same way", () => {
    // The API maps its Decimal columns to numbers; a string (an untyped or
    // older response) must not reach the field as "12.50".
    const values = fromDiscount(
      saved({
        value: "12.50" as unknown as number,
        minCartValue: "1000.00" as unknown as number,
      }),
    );
    expect(values.value).toBe("12,50");
    expect(values.minCartValue).toBe("1000");
  });

  it("leaves absent amounts empty", () => {
    const values = fromDiscount(
      saved({ minCartValue: null, maxDiscountAmount: null }),
    );
    expect(values.minCartValue).toBe("");
    expect(values.maxDiscountAmount).toBe("");
  });

  it("round-trips an unchanged edit to the saved amounts", () => {
    const values = fromDiscount(
      saved({ value: 1250.5, minCartValue: 1000, maxDiscountAmount: 99.99 }),
    );
    expect(issues(values)).toEqual({});
    expect(buildPayload(values)).toMatchObject({
      value: 1250.5,
      minCartValue: 1000,
      maxDiscountAmount: 99.99,
    });
  });
});
