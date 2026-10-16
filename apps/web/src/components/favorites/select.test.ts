/** @format */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ wishlistApi: {} }));

import { withWishlistEntry, type WishlistEntry } from "@/lib/wishlist";
import { selectFavoritesView } from "./select";

const row = (productId: string): WishlistEntry => ({
  id: `w-${productId}`,
  productId,
  productTitle: `Ürün ${productId}`,
  productPrice: 10,
  sellerId: "s",
  sellerName: "Satıcı",
  addedAt: "2026-10-16",
});

describe("selectFavoritesView", () => {
  it("tam satırları sırasıyla çizer", () => {
    const view = selectFavoritesView([row("a"), row("b")]);
    expect(view.items.map((item) => item.productId)).toEqual(["a", "b"]);
    expect(view.pendingCount).toBe(0);
  });

  // Header / profil rozeti listenin uzunluğunu sayar; sayfa da iyimser satırı
  // yükleniyor kartı olarak gösterip AYNI sayıya ulaşır.
  it("iyimser satırı çizmez ama yükleniyor kartı olarak sayar", () => {
    const entries = withWishlistEntry([row("a")], "b", true);
    const view = selectFavoritesView(entries);

    expect(view.items.map((item) => item.productId)).toEqual(["a"]);
    expect(view.pendingCount).toBe(1);
    expect(view.items.length + view.pendingCount).toBe(entries.length);
  });

  it("başlığı olmayan bozuk satırı ne çizer ne sayar", () => {
    const view = selectFavoritesView([
      row("a"),
      { id: "x", productId: "x", productTitle: "" },
    ]);
    expect(view.items).toHaveLength(1);
    expect(view.pendingCount).toBe(0);
  });
});
