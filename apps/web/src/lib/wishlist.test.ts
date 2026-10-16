/** @format */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ wishlistApi: {} }));

import {
  unwrapWishlistItems,
  wishlistIdSet,
  withWishlistEntry,
  type WishlistEntry,
} from "./wishlist";

const row = (productId: string, extra: Partial<WishlistEntry> = {}) => ({
  id: `w-${productId}`,
  productId,
  ...extra,
});

describe("unwrapWishlistItems", () => {
  it("API'nin { items } zarfını açar", () => {
    expect(unwrapWishlistItems({ items: [row("a")], totalItems: 1 })).toEqual([
      row("a"),
    ]);
  });

  it("{ data } zarfını ve çıplak diziyi de kabul eder", () => {
    expect(unwrapWishlistItems({ data: [row("a")] })).toEqual([row("a")]);
    expect(unwrapWishlistItems([row("b")])).toEqual([row("b")]);
  });

  it("productId'siz satırları ve dizi olmayan yanıtları eler", () => {
    expect(unwrapWishlistItems([row("a"), null, { id: "x" }])).toEqual([
      row("a"),
    ]);
    expect(unwrapWishlistItems(undefined)).toEqual([]);
    expect(unwrapWishlistItems({ items: "bozuk" })).toEqual([]);
  });
});

describe("wishlistIdSet", () => {
  it("ürün id'lerinden küme türetir", () => {
    const ids = wishlistIdSet([row("a"), row("b")]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
  });
});

describe("withWishlistEntry", () => {
  it("eklerken ürünü başa geçici bir satırla koyar", () => {
    expect(withWishlistEntry([row("a")], "b", true)).toEqual([
      { productId: "b" },
      row("a"),
    ]);
  });

  it("geri alırken verilen asıl satırı geri koyar", () => {
    expect(withWishlistEntry([row("a")], "b", true, row("b"))).toEqual([
      row("b"),
      row("a"),
    ]);
  });

  it("çıkarırken yalnız o ürünü siler", () => {
    expect(withWishlistEntry([row("a"), row("b")], "a", false)).toEqual([
      row("b"),
    ]);
  });

  it("değişiklik yoksa aynı diziyi döndürür", () => {
    const items = [row("a")];
    expect(withWishlistEntry(items, "a", true)).toBe(items);
    expect(withWishlistEntry(items, "z", false)).toBe(items);
  });
});
