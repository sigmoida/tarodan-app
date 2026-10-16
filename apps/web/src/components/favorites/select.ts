/** @format */

import { isPendingWishlistEntry, type WishlistEntry } from "@/lib/wishlist";
import type { WishlistItem } from "./types";

/** Favorilerim'in görünümü: çizilecek tam satırlar + yükleniyor kartları. */
export interface FavoritesView {
  items: WishlistItem[];
  /**
   * Henüz gerçek satırı gelmemiş iyimser eklemeler (kartta yeni favorilenen
   * ürün). Header / profil rozetleri bunları SAYDIĞI için sayfa da onları
   * yükleniyor kartı olarak gösterir — sayı ile kart adedi ayrışmaz.
   */
  pendingCount: number;
}

/**
 * Önbellekteki favori listesini sayfanın görünümüne ayırır. Modül düzeyinde
 * sabit bir fonksiyon: `select` olarak verildiğinde TanStack sonucu ezberler.
 * Başlığı olmayan (bozuk) satırlar çizilmez.
 */
export function selectFavoritesView(
  entries: readonly WishlistEntry[],
): FavoritesView {
  const items: WishlistItem[] = [];
  let pendingCount = 0;
  for (const entry of entries) {
    if (isPendingWishlistEntry(entry)) {
      pendingCount += 1;
    } else if (typeof entry.productTitle === "string" && entry.productTitle) {
      items.push(entry as WishlistEntry & WishlistItem);
    }
  }
  return { items, pendingCount };
}
