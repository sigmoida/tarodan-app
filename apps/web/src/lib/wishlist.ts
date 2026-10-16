/** @format */

import { queryOptions, type QueryClient } from "@tanstack/react-query";
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
  /**
   * İyimser eklemenin geçici satırı: yalnız `productId` taşır, gerçek satır bir
   * sonraki tazelemede gelir. Header / profil rozetleri onu SAYAR (kullanıcı
   * favoriledi); Favorilerim onu yükleniyor kartı olarak gösterir — sayı ile
   * kart adedi her yerde aynı kalır.
   */
  pending?: true;
  [key: string]: unknown;
}

/** Satır iyimser eklemenin geçici satırı mı? (bkz. `WishlistEntry.pending`) */
export function isPendingWishlistEntry(entry: WishlistEntry): boolean {
  return entry.pending === true;
}

/** Geri alınacak satır ve listedeki ESKİ yeri. */
export interface WishlistRestore {
  entry: WishlistEntry;
  index: number;
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
 * `add` = true: ürün yoksa eklenir — `restore` verilmişse o satır ESKİ
 * yerine (başarısız çıkarmanın geri alınması; kart sırası zıplamasın), yoksa
 * başa geçici bir satır (`pending`). `add` = false: ürün listeden çıkarılır.
 * Değişiklik yoksa AYNI dizi döner.
 */
export function withWishlistEntry(
  items: readonly WishlistEntry[],
  productId: string,
  add: boolean,
  restore?: WishlistRestore,
): WishlistEntry[] {
  const present = items.some((item) => item.productId === productId);
  if (add) {
    if (present) return items as WishlistEntry[];
    if (!restore) return [{ productId, pending: true }, ...items];
    // Arada liste kısalmış olabilir (başka bir ürün çıkarıldı): sona taşmaz.
    const at = Math.max(0, Math.min(restore.index, items.length));
    return [...items.slice(0, at), restore.entry, ...items.slice(at)];
  }
  return present
    ? items.filter((item) => item.productId !== productId)
    : (items as WishlistEntry[]);
}

type AuthUserSlice = { user?: { id: string } | null };

/**
 * Auth store aboneliği: oturum sahibi değişince (çıkış, oturum süresinin
 * dolması, aynı sekmede başka hesap) önceki kullanıcının favori listesini
 * önbellekten siler. Aksi hâlde tekil QueryClient listeyi bir sonraki
 * oturuma taşır ve yeni kullanıcı bir süre önceki kullanıcının kalplerini
 * görür. İstemci tembel alınır: abonelik QueryProvider'dan bağımsız çalışır
 * (`/logout` sayfası o sağlayıcının dışındadır).
 */
export function forgetWishlistOnUserChange(getClient: () => QueryClient) {
  return (state: AuthUserSlice, prev: AuthUserSlice) => {
    const prevId = prev.user?.id;
    if (prevId && state.user?.id !== prevId) {
      getClient().removeQueries({ queryKey: queryKeys.wishlist.all() });
    }
  };
}
