import { describe, expect, it } from "vitest";
import { discountFormToPayload, discountToForm } from "./form";
import type { Discount } from "./types";

const record = {
  id: "d1",
  code: "SUMMER",
  name: "Summer",
  description: null,
  type: "fixed_amount",
  value: 1250.5,
  scope: "global",
  sellerId: null,
  sellerName: null,
  categoryId: null,
  categoryName: null,
  targetProductIds: [],
  minCartValue: 1000,
  minQuantity: null,
  buyQuantity: null,
  getQuantity: null,
  maxDiscountAmount: null,
  usageLimitTotal: null,
  usageLimitPerUser: 1,
  usedCount: 0,
  isStackable: false,
  priority: 0,
  isActive: true,
  isFlashSale: false,
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-01-31T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  isCurrentlyValid: true,
  remainingUsage: null,
  target: "buyer_commission",
  audience: "everyone",
  budgetLimit: 5000.25,
  budgetSpent: 0,
  budgetStoppedAt: null,
} satisfies Discount;

describe("discountToForm", () => {
  it("prefills the amounts with a decimal comma", () => {
    const form = discountToForm(record);
    expect(form.value).toBe("1250,50");
    expect(form.minCartValue).toBe("1000");
    expect(form.budgetLimit).toBe("5000,25");
    expect(form.maxDiscountAmount).toBe("");
  });
});

describe("discountFormToPayload", () => {
  it("reads typed amounts as TL, never a grouped dot as a decimal", () => {
    const payload = discountFormToPayload({
      ...discountToForm(record),
      value: "1000",
      budgetLimit: "1250,50",
      minCartValue: "99,9",
      maxDiscountAmount: "",
    });
    expect(payload).toMatchObject({
      value: 1000,
      budgetLimit: 1250.5,
      minCartValue: 99.9,
      maxDiscountAmount: undefined,
    });
  });

  it("round-trips the prefill unchanged", () => {
    const payload = discountFormToPayload(discountToForm(record));
    expect(payload).toMatchObject({
      value: 1250.5,
      minCartValue: 1000,
      budgetLimit: 5000.25,
    });
  });

  it("keeps a typed 0 as 0, as before", () => {
    const payload = discountFormToPayload({
      ...discountToForm(record),
      minCartValue: "0",
    });
    expect(payload.minCartValue).toBe(0);
  });
});
