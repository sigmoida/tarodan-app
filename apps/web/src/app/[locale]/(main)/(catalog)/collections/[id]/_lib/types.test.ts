/** @format */

import { describe, expect, it } from "vitest";
import {
  isNotForSale,
  itemCardProps,
  itemToProduct,
  type CollectionItem,
} from "./types";

const item = (overrides: Partial<CollectionItem> = {}): CollectionItem => ({
  id: "i1",
  productId: "p1",
  productTitle: "Model",
  sortOrder: 0,
  isFeatured: false,
  addedAt: "2026-01-01T00:00:00Z",
  isCustom: false,
  ...overrides,
});

describe("itemToProduct — sellerId", () => {
  it("satıcıyı karta taşır (kendi ilanında kalp gizleme kuralı için)", () => {
    expect(itemToProduct(item({ sellerId: "s1" })).sellerId).toBe("s1");
  });

  it("özel öğede / alan yokken sellerId tanımsız kalır", () => {
    expect(itemToProduct(item({ sellerId: null })).sellerId).toBeUndefined();
    expect(itemToProduct(item()).sellerId).toBeUndefined();
  });
});

describe("isNotForSale", () => {
  it("a custom item is not for sale; a listing item is", () => {
    expect(isNotForSale(item({ isCustom: true, productId: undefined }))).toBe(
      true,
    );
    expect(isNotForSale(item({ productPrice: 100 }))).toBe(false);
  });
});

describe("itemCardProps", () => {
  it("a custom item: no link, the not-for-sale label", () => {
    const props = itemCardProps(
      item({ isCustom: true, productId: undefined, customTitle: "Mine" }),
      "Satışta değil",
    );
    expect(props.href).toBeNull();
    expect(props.noPriceLabel).toBe("Satışta değil");
    expect(props.product.title).toBe("Mine");
  });

  it("a listing item: the default link and its price", () => {
    const props = itemCardProps(item({ productPrice: 100 }), "Satışta değil");
    expect(props.href).toBeUndefined();
    expect(props.noPriceLabel).toBeUndefined();
    expect(props.product.price).toBe(100);
  });
});
