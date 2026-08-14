import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { YEARLY_DISCOUNT_MAX, yearlyDiscountSchema } from "./schema";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

describe("yearlyDiscountSchema — 0..YEARLY_DISCOUNT_MAX range", () => {
  const schema = yearlyDiscountSchema(t);

  it("accepts the boundary values 0 and YEARLY_DISCOUNT_MAX", () => {
    expect(schema.safeParse({ discount: "0" }).success).toBe(true);
    expect(
      schema.safeParse({ discount: String(YEARLY_DISCOUNT_MAX) }).success,
    ).toBe(true);
  });

  it("rejects a value just over YEARLY_DISCOUNT_MAX", () => {
    expect(
      schema.safeParse({ discount: String(YEARLY_DISCOUNT_MAX + 1) }).success,
    ).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(schema.safeParse({ discount: "-1" }).success).toBe(false);
  });

  it("rejects a non-numeric value", () => {
    expect(schema.safeParse({ discount: "abc" }).success).toBe(false);
  });

  it("rejects an empty or whitespace-only value as required", () => {
    expect(schema.safeParse({ discount: "" }).success).toBe(false);
    expect(schema.safeParse({ discount: "  " }).success).toBe(false);
  });
});
