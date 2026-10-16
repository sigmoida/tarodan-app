/** @format */

import { describe, expect, it } from "vitest";
import { itemToProduct, type CollectionItem } from "./types";

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
