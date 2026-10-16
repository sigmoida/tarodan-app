/** @format */

import { describe, expect, it } from "vitest";
import { getProductDiscountPercent } from "./productPrice";

describe("getProductDiscountPercent", () => {
  it("API'nin discountPercent değerini önceliklendirir", () => {
    expect(
      getProductDiscountPercent({
        price: 80,
        oldPrice: 100,
        discountPercent: 25,
      }),
    ).toBe(25);
  });

  it("discountPercent yoksa eski/güncel fiyattan hesaplar", () => {
    expect(getProductDiscountPercent({ price: 75, oldPrice: 100 })).toBe(25);
    expect(getProductDiscountPercent({ price: 75, originalPrice: 100 })).toBe(
      25,
    );
  });

  it("eski fiyat yoksa ya da fiyat düşmemişse 0 döner", () => {
    expect(getProductDiscountPercent({ price: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 120, oldPrice: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 100, isOnSale: true })).toBe(0);
  });
});
