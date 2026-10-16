/** @format */

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ wishlistApi: {} }));

import { queryKeys } from "@/lib/query/keys";
import {
  forgetWishlistOnUserChange,
  isPendingWishlistEntry,
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

describe("forgetWishlistOnUserChange", () => {
  const seeded = () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.wishlist.all(), [row("a")]);
    return client;
  };
  const user = (id: string) => ({ user: { id } });

  it("çıkışta önceki kullanıcının favori listesini önbellekten siler", () => {
    const client = seeded();
    forgetWishlistOnUserChange(() => client)({ user: null }, user("u1"));
    expect(client.getQueryData(queryKeys.wishlist.all())).toBeUndefined();
  });

  it("aynı sekmede başka hesaba geçişte de siler", () => {
    const client = seeded();
    forgetWishlistOnUserChange(() => client)(user("u2"), user("u1"));
    expect(client.getQueryData(queryKeys.wishlist.all())).toBeUndefined();
  });

  it("girişte ve aynı kullanıcının güncellemelerinde dokunmaz", () => {
    const client = seeded();
    const listener = forgetWishlistOnUserChange(() => client);
    listener(user("u1"), { user: null });
    listener(user("u1"), user("u1"));
    expect(client.getQueryData(queryKeys.wishlist.all())).toEqual([row("a")]);
  });
});
