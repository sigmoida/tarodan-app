/** @format */

import { describe, expect, it } from "vitest";
import { getProductDiscountPercent } from "./productPrice";

describe("getProductDiscountPercent", () => {
  it("eski ve yeni fiyat varsa her zaman fiyatlardan hesaplar (yuvarlanmış)", () => {
    expect(getProductDiscountPercent({ price: 75, oldPrice: 100 })).toBe(25);
    expect(getProductDiscountPercent({ price: 75, originalPrice: 100 })).toBe(
      25,
    );
    expect(getProductDiscountPercent({ price: 200, oldPrice: 300 })).toBe(33);
    // API'nin bildirdiği yüzde, üstü çizili fiyatla çelişiyorsa fiyat kazanır.
    expect(
      getProductDiscountPercent({
        price: 80,
        oldPrice: 100,
        discountPercent: 50,
      }),
    ).toBe(20);
  });

  it("fiyatlardan hesaplanamıyorsa discountPercent'e düşer (yuvarlanmış)", () => {
    expect(
      getProductDiscountPercent({
        price: 100,
        isOnSale: true,
        discountPercent: 25.4,
      }),
    ).toBe(25);
    expect(
      getProductDiscountPercent({
        price: 120,
        oldPrice: 100,
        isOnSale: true,
        discountPercent: 10,
      }),
    ).toBe(10);
  });

  it("indirimde değilse ya da yüzde yoksa 0 döner", () => {
    expect(getProductDiscountPercent({ price: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 120, oldPrice: 100 })).toBe(0);
    expect(getProductDiscountPercent({ price: 100, isOnSale: true })).toBe(0);
    expect(getProductDiscountPercent({ price: 100, discountPercent: 20 })).toBe(
      0,
    );
  });
});
