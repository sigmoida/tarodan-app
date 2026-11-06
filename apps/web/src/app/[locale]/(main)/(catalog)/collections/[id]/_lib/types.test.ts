/** @format */

import { describe, expect, it } from "vitest";
import {
  isNotForSale,
  itemCardProps,
  itemDisplayTitle,
  itemToProduct,
  orderCollectionItems,
  sortCollectionItems,
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

describe("orderCollectionItems / sortCollectionItems", () => {
  const items = [
    item({ id: "a", sortOrder: 2 }),
    item({ id: "hidden", productStatus: "hidden", sortOrder: 1 }),
    item({ id: "deleted", productStatus: "deleted", sortOrder: 3 }),
    item({ id: "featured", isFeatured: true, sortOrder: 9 }),
    item({ id: "custom", isCustom: true, productId: undefined, sortOrder: 0 }),
  ];

  it("the owner's order keeps hidden and deleted items, featured first", () => {
    expect(orderCollectionItems(items).map((i) => i.id)).toEqual([
      "featured",
      "custom",
      "hidden",
      "a",
      "deleted",
    ]);
  });

  it("the public detail order still drops hidden and deleted listings", () => {
    expect(sortCollectionItems(items).map((i) => i.id)).toEqual([
      "featured",
      "custom",
      "a",
    ]);
  });

  it("returns an empty list when there are no items", () => {
    expect(orderCollectionItems(undefined)).toEqual([]);
  });
});

describe("itemDisplayTitle", () => {
  it("falls back when the listing has no usable title", () => {
    expect(itemDisplayTitle(item({ productTitle: "  " }), "Untitled")).toBe(
      "Untitled",
    );
    expect(
      itemDisplayTitle(
        item({ productTitle: undefined as unknown as string }),
        "Untitled",
      ),
    ).toBe("Untitled");
  });

  it("prefers a custom item's own title", () => {
    expect(
      itemDisplayTitle(
        item({ isCustom: true, customTitle: "Mine", productTitle: "" }),
        "Untitled",
      ),
    ).toBe("Mine");
  });
});
