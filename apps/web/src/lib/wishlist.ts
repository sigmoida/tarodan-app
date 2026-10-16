/** @format */

import { queryOptions } from "@tanstack/react-query";
import { wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * Favori listesinin TEK kaynağı: `GET /wishlist` (sayfalı değil, kullanıcının
 * bütün favorileri). Header rozeti, profil sayacı, Favorilerim sayfası, ürün
 * kartlarındaki kalp ve ilan detayındaki kalp hep bu sorguyu okur. Daha önce
 * aynı `["wishlist"]` anahtarı üç farklı `queryFn` ile yazılıyordu (hangisi son
 * çalıştıysa önbellek onun biçimindeydi) ve detay ayrıca `/wishlist/check`
 * soruyordu — kartta favorilenen ürün detayda boş kalp gösterebiliyordu.
 */

/** Listedeki bir satır; kalp yalnız `productId`'ye bakar, diğer alanlar sayfanındır. */
export interface WishlistEntry {
  id?: string;
  productId: string;
  [key: string]: unknown;
}

/** `{ items }` / `{ data }` / çıplak dizi zarflarını tek diziye indirger. */
export function unwrapWishlistItems(raw: unknown): WishlistEntry[] {
  const envelope = raw as { items?: unknown; data?: unknown } | null;
  const list = envelope?.items ?? envelope?.data ?? raw;
  return Array.isArray(list)
    ? list.filter(
        (item): item is WishlistEntry =>
          !!item && typeof (item as WishlistEntry).productId === "string",
      )
    : [];
}

export async function fetchWishlistItems(): Promise<WishlistEntry[]> {
  const response = await wishlistApi.get();
  return unwrapWishlistItems(response.data);
}

/** Paylaşılan sorgu tanımı — çağıran yalnız `enabled` / `meta` / `select` ekler. */
export const wishlistItemsQuery = queryOptions({
  queryKey: queryKeys.wishlist.all(),
  queryFn: fetchWishlistItems,
});

/**
 * Listeden favori ürün id'lerinin kümesi. Modül düzeyinde sabit bir fonksiyon
 * olduğu için `select` olarak verildiğinde TanStack sonucu ezberler (her kart
 * yeniden render'da yeni bir Set üretmez).
 */
export function wishlistIdSet(
  items: readonly WishlistEntry[],
): ReadonlySet<string> {
  return new Set(items.map((item) => item.productId));
}

/**
 * İyimser güncelleme ve geri alma için listeyi tek ürün bazında değiştirir.
 * `add` = true: ürün yoksa başa eklenir (`restore` verilmişse o satır, yoksa
 * yalnız `productId` taşıyan geçici bir satır — gerçek satır bir sonraki
 * tazelemede gelir). `add` = false: ürün listeden çıkarılır. Değişiklik
 * yoksa AYNI dizi döner.
 */
export function withWishlistEntry(
  items: readonly WishlistEntry[],
  productId: string,
  add: boolean,
  restore?: WishlistEntry,
): WishlistEntry[] {
  const present = items.some((item) => item.productId === productId);
  if (add) {
    return present
      ? (items as WishlistEntry[])
      : [restore ?? { productId }, ...items];
  }
  return present
    ? items.filter((item) => item.productId !== productId)
    : (items as WishlistEntry[]);
}
