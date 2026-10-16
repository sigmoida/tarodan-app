/** @format */

import { describe, expect, it } from "vitest";
import { getProductDiscountPercent } from "./productPrice";

describe("getProductDiscountPercent", () => {
  it("discountPercent > 0 ise yuvarlanmış haliyle esastır", () => {
    expect(
      getProductDiscountPercent({
        price: 80,
        oldPrice: 100,
        discountPercent: 25.4,
      }),
    ).toBe(25);
  });

  it("discountPercent yoksa/0 ise eski/güncel fiyattan yuvarlanmış hesaplar", () => {
    expect(getProductDiscountPercent({ price: 75, oldPrice: 100 })).toBe(25);
    expect(getProductDiscountPercent({ price: 75, originalPrice: 100 })).toBe(
      25,
    );
    expect(
      getProductDiscountPercent({
        price: 200,
        oldPrice: 300,
        discountPercent: 0,
      }),
    ).toBe(33);
  });

  it("indirimde değilse ya da fiyat düşmemişse 0 döner", () => {
    expect(getProductDiscountPercent({ price: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 120, oldPrice: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 100, isOnSale: true })).toBe(0);
    expect(getProductDiscountPercent({ price: 100, discountPercent: 20 })).toBe(
      0,
    );
  });
});
