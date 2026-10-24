/** @format */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ wishlistApi: {} }));

import {
  isPendingWishlistEntry,
  settleWishlistEntry,
  unwrapWishlistItems,
  wishlistEntryFrom,
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
  it("eklerken ürünü başa geçici (pending) bir satırla koyar", () => {
    const next = withWishlistEntry([row("a")], "b", true);
    expect(next).toEqual([{ productId: "b", pending: true }, row("a")]);
    expect(isPendingWishlistEntry(next[0])).toBe(true);
    expect(isPendingWishlistEntry(next[1])).toBe(false);
  });

  it("geri alırken asıl satırı ESKİ yerine koyar (başa değil)", () => {
    expect(
      withWishlistEntry([row("a"), row("c")], "b", true, {
        entry: row("b"),
        index: 1,
      }),
    ).toEqual([row("a"), row("b"), row("c")]);
  });

  it("liste arada kısaldıysa geri konan satır sona taşmaz", () => {
    expect(
      withWishlistEntry([row("a")], "c", true, { entry: row("c"), index: 5 }),
    ).toEqual([row("a"), row("c")]);
  });

  it("ilk sıradaki satır yine başa döner", () => {
    expect(
      withWishlistEntry([row("b")], "a", true, { entry: row("a"), index: 0 }),
    ).toEqual([row("a"), row("b")]);
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

describe("wishlistEntryFrom", () => {
  it("çıplak satırı ve { data } zarfını tanır", () => {
    expect(wishlistEntryFrom(row("a"))).toEqual(row("a"));
    expect(wishlistEntryFrom({ data: row("a") })).toEqual(row("a"));
  });

  it("productId yoksa undefined", () => {
    expect(wishlistEntryFrom({ ok: true })).toBeUndefined();
    expect(wishlistEntryFrom(undefined)).toBeUndefined();
  });
});

describe("settleWishlistEntry", () => {
  const pendingList = () => withWishlistEntry([row("a")], "b", true);

  it("geçici satırı sunucu satırıyla değiştirir", () => {
    expect(settleWishlistEntry(pendingList(), "b", row("b"))).toEqual([
      row("b"),
      row("a"),
    ]);
  });

  it("sunucu satırı yoksa yalnız bayrağı kaldırır", () => {
    expect(settleWishlistEntry(pendingList(), "b")).toEqual([
      { productId: "b" },
      row("a"),
    ]);
  });

  it("başka ürünün satırını ya da gerçek satırı değiştirmez", () => {
    const items = [row("a")];
    expect(settleWishlistEntry(items, "a", row("a"))).toBe(items);
    expect(settleWishlistEntry(pendingList(), "z")).toEqual(pendingList());
  });
});
