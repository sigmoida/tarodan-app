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
