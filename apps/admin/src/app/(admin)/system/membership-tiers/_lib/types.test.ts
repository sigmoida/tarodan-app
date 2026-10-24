import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { SAVED_SEARCH_TIER_LIMIT_MAX } from "@tarodan/types";
import {
  type MembershipTier,
  tierFormToPayload,
  tierSchema,
  tierToForm,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

const tier: MembershipTier = {
  id: "t1",
  type: "premium",
  name: "Premium",
  monthlyPrice: 99,
  yearlyPrice: 990,
  maxFreeListings: 5,
  maxTotalListings: 50,
  maxImagesPerListing: 10,
  maxSavedSearches: 20,
  canCreateCollections: true,
  canTrade: true,
  isAdFree: false,
  isActive: true,
  sortOrder: 1,
  userCount: 0,
};

describe("tier form maxSavedSearches", () => {
  const schema = tierSchema(t);
  const base = tierToForm(tier);
  const parse = (v: string) =>
    schema.safeParse({ ...base, maxSavedSearches: v }).success;

  it("accepts 0 and the shared maximum", () => {
    expect(parse("0")).toBe(true);
    expect(parse(String(SAVED_SEARCH_TIER_LIMIT_MAX))).toBe(true);
  });

  it("rejects out-of-range, fractional, empty and non-numeric values", () => {
    expect(parse(String(SAVED_SEARCH_TIER_LIMIT_MAX + 1))).toBe(false);
    expect(parse("-1")).toBe(false);
    expect(parse("2.5")).toBe(false);
    expect(parse("")).toBe(false);
    expect(parse("abc")).toBe(false);
  });

  it("passes the shared maximum into the range message", () => {
    const tWithParams = ((key: string, values?: { max?: number }) =>
      values?.max != null ? `${key}:${values.max}` : key) as T;
    const result = tierSchema(tWithParams).safeParse({
      ...base,
      maxSavedSearches: String(SAVED_SEARCH_TIER_LIMIT_MAX + 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `admin.tiers.validation.savedSearchLimitRange:${SAVED_SEARCH_TIER_LIMIT_MAX}`,
    );
  });

  it("seeds the form from the tier and sends an integer in the payload", () => {
    expect(base.maxSavedSearches).toBe("20");
    const payload = tierFormToPayload(
      { ...base, maxSavedSearches: "150" },
      990,
    );
    expect(payload.maxSavedSearches).toBe(150);
    expect(
      tierFormToPayload({ ...base, maxSavedSearches: "0" }, 0).maxSavedSearches,
    ).toBe(0);
  });
});

describe("tier form monthlyPrice", () => {
  const priceMessages = (monthlyPrice: string, isFree = false) => {
    const values = { ...tierToForm(tier), monthlyPrice };
    const result = tierSchema(t, isFree).safeParse(values);
    return result.success
      ? []
      : result.error.issues
          .filter((issue) => issue.path[0] === "monthlyPrice")
          .map((issue) => issue.message);
  };

  it("refuses 1.000 instead of reading it as 1 TL", () => {
    expect(priceMessages("1.000")).toEqual(["validation.amountFormatRefused"]);
  });

  it("accepts comma prices and keeps the paid and free price rules", () => {
    expect(priceMessages("99,90")).toEqual([]);
    expect(priceMessages("1000")).toEqual([]);
    expect(priceMessages("0")).toEqual([
      "admin.tiers.validation.paidPricePositive",
    ]);
    expect(priceMessages("0", true)).toEqual([]);
    expect(priceMessages("5", true)).toEqual([
      "admin.tiers.validation.freePriceZero",
    ]);
  });

  it("prefills with a decimal comma and sends the TL amount", () => {
    const form = tierToForm({ ...tier, monthlyPrice: 1249.9 });
    expect(form.monthlyPrice).toBe("1249,90");
    expect(tierFormToPayload(form, 0).monthlyPrice).toBe(1249.9);
    expect(
      tierFormToPayload({ ...form, monthlyPrice: "1000" }, 0).monthlyPrice,
    ).toBe(1000);
    expect(tierToForm({ ...tier, monthlyPrice: 0 }).monthlyPrice).toBe("0");
  });
});
