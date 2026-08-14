import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import type { z } from "zod";
import { discountSchema, type DiscountFormValues } from "./schema";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;
const schema = discountSchema(t);

function issuePaths(result: z.SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join("."));
}

const base: DiscountFormValues = {
  code: "SUMMER10",
  name: "Summer Sale",
  description: "",
  type: "percentage",
  value: "10",
  scope: "global",
  categoryId: "",
  target: "buyer_commission",
  audience: "everyone",
  targetTierTypes: [],
  targetUserIds: "",
  budgetLimit: "1000",
  minCartValue: "",
  minQuantity: "",
  buyQuantity: "",
  getQuantity: "",
  maxDiscountAmount: "",
  usageLimitTotal: "",
  usageLimitPerUser: "",
  isStackable: false,
  isActive: true,
  isFlashSale: false,
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

describe("discountSchema — baseline", () => {
  it("accepts a fully valid discount", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });
});

describe("discountSchema — category scope requires categoryId", () => {
  it("rejects scope=category with no categoryId", () => {
    const result = schema.safeParse({ ...base, scope: "category" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("categoryId");
  });

  it("accepts scope=category with a categoryId", () => {
    const result = schema.safeParse({
      ...base,
      scope: "category",
      categoryId: "cat-1",
    });
    expect(result.success).toBe(true);
  });
});

describe("discountSchema — budgetLimit is mandatory for every discount type", () => {
  // The refine is unconditional (applies regardless of `type`) even though
  // its message/comment frames it as an amount-discount cost control.
  it.each(["0", "-5", "abc", ""])(
    "rejects budgetLimit=%s regardless of discount type",
    (budgetLimit) => {
      const result = schema.safeParse({ ...base, budgetLimit });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain("budgetLimit");
    },
  );

  it("accepts a positive budgetLimit", () => {
    expect(schema.safeParse({ ...base, budgetLimit: "500" }).success).toBe(
      true,
    );
  });
});

describe("discountSchema — membership_tiers audience requires targetTierTypes", () => {
  it("rejects an empty targetTierTypes", () => {
    const result = schema.safeParse({
      ...base,
      audience: "membership_tiers",
      targetTierTypes: [],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("targetTierTypes");
  });

  it("accepts a non-empty targetTierTypes", () => {
    const result = schema.safeParse({
      ...base,
      audience: "membership_tiers",
      targetTierTypes: [{ value: "gold", label: "Gold" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("discountSchema — specific_buyers/specific_sellers require targetUserIds", () => {
  it("rejects an empty targetUserIds for specific_buyers", () => {
    const result = schema.safeParse({
      ...base,
      audience: "specific_buyers",
      targetUserIds: "",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("targetUserIds");
  });

  it("rejects a whitespace-only targetUserIds", () => {
    const result = schema.safeParse({
      ...base,
      audience: "specific_sellers",
      targetUserIds: "   ",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("targetUserIds");
  });

  it("accepts a non-empty targetUserIds", () => {
    const result = schema.safeParse({
      ...base,
      audience: "specific_buyers",
      targetUserIds: "user-1,user-2",
    });
    expect(result.success).toBe(true);
  });
});

describe("discountSchema — target side must match audience side", () => {
  it("rejects a seller_-prefixed target with an all-buyers audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "seller_commission",
      audience: "all_buyers",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("audience");
  });

  it("rejects a seller_-prefixed target with a specific_buyers audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "seller_platform_fee",
      audience: "specific_buyers",
      targetUserIds: "user-1",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("audience");
  });

  it("accepts a seller_-prefixed target with a non-buyer-only audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "seller_commission",
      audience: "everyone",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a buyer_-prefixed target with an all-sellers audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "buyer_shipping",
      audience: "all_sellers",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("audience");
  });

  it("rejects a buyer_-prefixed target with a specific_sellers audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "buyer_service_fee",
      audience: "specific_sellers",
      targetUserIds: "user-1",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("audience");
  });

  it("accepts trade_service_fee (neither buyer_ nor seller_ prefixed) with any audience", () => {
    const result = schema.safeParse({
      ...base,
      target: "trade_service_fee",
      audience: "all_sellers",
    });
    expect(result.success).toBe(true);
  });
});
