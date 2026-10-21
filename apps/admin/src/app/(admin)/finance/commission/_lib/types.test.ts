import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  commissionFormToPayload,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  type CommissionFormValues,
  type CommissionRule,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;
const schema = commissionSchema(t);

const valid: CommissionFormValues = {
  ...emptyCommissionForm,
  name: "Default",
  categoryId: "c1",
  sellerCommissionRate: "7.5",
};

const messagesAt = (values: Partial<CommissionFormValues>, path: string) => {
  const result = schema.safeParse({ ...valid, ...values });
  return result.success
    ? []
    : result.error.issues
        .filter((issue) => issue.path.join(".") === path)
        .map((issue) => issue.message);
};

const TL_FIELDS = [
  "minAmount",
  "maxAmount",
  "sellerCommissionMin",
  "sellerCommissionMax",
  "tradeFeeSellerAmount",
  "tradeFeeBuyerAmount",
] as const;

describe("commissionSchema TL fields", () => {
  it("accepts the valid baseline", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each(TL_FIELDS)('refuses a grouped %s ("1.000" is not 1 TL)', (field) => {
    expect(messagesAt({ [field]: "1.000" }, field)).toEqual([
      "validation.amountFormatRefused",
    ]);
  });

  it("compares comma amounts as TL", () => {
    expect(
      messagesAt({ minAmount: "1000", maxAmount: "999,99" }, "maxAmount"),
    ).toEqual(["admin.finance.commission.validation.strictRange"]);
    expect(
      messagesAt({ minAmount: "1000", maxAmount: "1000,01" }, "maxAmount"),
    ).toEqual([]);
    expect(
      messagesAt(
        { sellerCommissionMin: "50,5", sellerCommissionMax: "50" },
        "sellerCommissionMax",
      ),
    ).toEqual(["admin.finance.commission.validation.maxBelowMin"]);
  });

  it("requires the minimum amount and the trade fees", () => {
    expect(messagesAt({ minAmount: "" }, "minAmount")).toEqual([
      "validation.required",
    ]);
    expect(
      messagesAt({ tradeFeeBuyerAmount: "" }, "tradeFeeBuyerAmount"),
    ).toEqual(["validation.required"]);
  });
});

describe("commissionFormToPayload TL fields", () => {
  it("sends typed amounts as TL", () => {
    const payload = commissionFormToPayload({
      ...valid,
      minAmount: "1000",
      maxAmount: "2500,50",
      sellerCommissionMin: "5,25",
      sellerCommissionMax: "",
      tradeFeeSellerAmount: "12,5",
      tradeFeeBuyerAmount: "0",
    });
    expect(payload).toMatchObject({
      minAmount: 1000,
      maxAmount: 2500.5,
      sellerCommissionRate: 7.5,
      sellerCommissionMin: 5.25,
      sellerCommissionMax: null,
      tradeFeeSellerAmount: 12.5,
      tradeFeeBuyerAmount: 0,
    });
  });

  it("round-trips the edit prefill with a decimal comma", () => {
    const rule = {
      id: "r1",
      ruleSetId: "s1",
      name: "Default",
      categoryId: "c1",
      categoryName: "Cars",
      sellerType: "FREE",
      minAmount: 0,
      maxAmount: 1250.5,
      buyerCommissionRate: 0,
      buyerCommissionMin: null,
      buyerCommissionMax: null,
      buyerServiceFeeRate: 0,
      buyerServiceFeeMin: null,
      buyerServiceFeeMax: null,
      sellerCommissionRate: 7.125,
      sellerCommissionMin: 5.5,
      sellerCommissionMax: 1000,
      sellerPlatformFeeRate: 0,
      sellerPlatformFeeMin: null,
      sellerPlatformFeeMax: null,
      tradeFeeSellerAmount: 12.5,
      tradeFeeBuyerAmount: 0,
      shippingBuyerShare: 100,
      shippingShares: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies CommissionRule;
    const form = ruleToForm(rule);
    expect(form).toMatchObject({
      minAmount: "0",
      maxAmount: "1250,50",
      sellerCommissionMin: "5,50",
      sellerCommissionMax: "1000",
      tradeFeeSellerAmount: "12,50",
      tradeFeeBuyerAmount: "0",
      // A rate keeps its four decimals: it is not a TL field.
      sellerCommissionRate: "7.125",
    });
    expect(schema.safeParse(form).success).toBe(true);
    expect(commissionFormToPayload(form)).toMatchObject({
      minAmount: 0,
      maxAmount: 1250.5,
      sellerCommissionRate: 7.125,
      sellerCommissionMin: 5.5,
      sellerCommissionMax: 1000,
      tradeFeeSellerAmount: 12.5,
      tradeFeeBuyerAmount: 0,
    });
  });
});
