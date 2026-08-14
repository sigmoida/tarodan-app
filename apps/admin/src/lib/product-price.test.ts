import { describe, expect, it } from "vitest";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
  type ProductPriceFields,
} from "./product-price";

describe("getProductEffectivePrice", () => {
  it("returns the current price as a number", () => {
    expect(getProductEffectivePrice({ price: 199.9 })).toBe(199.9);
  });

  it("coerces a string-typed price", () => {
    expect(
      getProductEffectivePrice({
        price: "199.9",
      } as unknown as ProductPriceFields),
    ).toBe(199.9);
  });
});

describe("isProductOnSaleDisplay", () => {
  it("is true when isOnSale is explicitly set, even without an old price", () => {
    expect(isProductOnSaleDisplay({ price: 100, isOnSale: true })).toBe(true);
  });

  it("is true when oldPrice is greater than price", () => {
    expect(isProductOnSaleDisplay({ price: 80, oldPrice: 100 })).toBe(true);
  });

  it("falls back to originalPrice when oldPrice is absent", () => {
    expect(isProductOnSaleDisplay({ price: 80, originalPrice: 100 })).toBe(
      true,
    );
  });

  it("prefers oldPrice over originalPrice when both are present", () => {
    // oldPrice (90) doesn't clear price (80); originalPrice (150) would.
    // isOnSale must reflect oldPrice winning the fallback, not originalPrice.
    expect(
      isProductOnSaleDisplay({
        price: 80,
        oldPrice: 85,
        originalPrice: 150,
      }),
    ).toBe(true);
  });

  it("is false when there's no old price at all", () => {
    expect(isProductOnSaleDisplay({ price: 100 })).toBe(false);
  });

  it("is false when the old price doesn't exceed the current price", () => {
    expect(isProductOnSaleDisplay({ price: 100, oldPrice: 100 })).toBe(false);
    expect(isProductOnSaleDisplay({ price: 100, oldPrice: 90 })).toBe(false);
  });
});

describe("getProductOriginalPriceForDisplay", () => {
  it("returns oldPrice when present", () => {
    expect(
      getProductOriginalPriceForDisplay({ price: 80, oldPrice: 100 }),
    ).toBe(100);
  });

  it("falls back to originalPrice when oldPrice is absent", () => {
    expect(
      getProductOriginalPriceForDisplay({ price: 80, originalPrice: 120 }),
    ).toBe(120);
  });

  it("falls back to price when neither old price field is present", () => {
    expect(getProductOriginalPriceForDisplay({ price: 80 })).toBe(80);
  });
});
