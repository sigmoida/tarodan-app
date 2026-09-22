import {
  ADMIN_ORDERS_DEFAULT_SCREEN_TAB,
  ADMIN_ORDERS_PATH,
  ADMIN_ORDERS_TAB_PARAM,
  type AdminOrdersScreenTab,
} from "@tarodan/types";
import { hrefWithPinnedParam, type QueryInput } from "@/lib/redirect-query";

/**
 * Siparişler ekranının üst sekmeleri arasında URL davranışı. Sekme sözlüğü,
 * izinler ve sorgusuz adresler `@tarodan/types` `admin-orders-screen.ts`'te;
 * burası panelin sorgu parametresi kurallarıdır.
 */

/**
 * Kullanıcı / ürün detayından gelen deep-link kapsamı: sekmeler arasında
 * TAŞINIR (bir kullanıcının siparişlerinden tekliflerine geçmek kapsamı
 * korur). Takaslar yalnız `userId`'yi okur; diğerleri yok sayılır.
 */
export const ORDERS_SCOPE_PARAMS = ["userId", "userRole", "productId"] as const;

/**
 * Bir sekmenin sahip olduğu URL parametreleri — sekme değişince silinir, ki
 * Takaslar'ın `status` filtresi Teklifler'e, siparişlerin alt sekmesi
 * Takaslar'a taşınmasın. Liste altyapısının kendi parametreleri (sayfa, arama,
 * sıralama, sayfa boyu) de sekmeye aittir. Kapsam parametreleri burada YOKTUR.
 */
export const ORDERS_TAB_SCOPED_PARAMS = [
  // liste altyapısı (useAdminResource)
  "page",
  "q",
  "sort",
  "dir",
  "sortType",
  "size",
  // sipariş sekmeleri
  "bucket",
  "party",
  "orderNumber",
  "packageNumber",
  "groupNumber",
  "productQuery",
  "startDate",
  "endDate",
  // sipariş (eski deep-link) + Teklifler + Takaslar
  "status",
  // Teklifler + Takaslar
  "fromDate",
  "toDate",
] as const;

/**
 * Bir sekmenin adresi, verilen sorgu korunarak — eski `/operations/offers` ve
 * `/operations/trades` listeleri (yer imleri, eski bildirim linkleri)
 * filtreleriyle birlikte buraya yönlenir. Varsayılan sekmede `tab` yazılmaz.
 */
export function ordersTabHref(
  tab: AdminOrdersScreenTab,
  query?: QueryInput,
): string {
  return hrefWithPinnedParam(
    ADMIN_ORDERS_PATH,
    ADMIN_ORDERS_TAB_PARAM,
    tab === ADMIN_ORDERS_DEFAULT_SCREEN_TAB ? null : tab,
    query,
  );
}

/**
 * Pasif bir sekmenin rozeti için sorgu: yalnız o sekmenin okuduğu kapsam
 * parametreleri (sekmeye geçildiğinde listenin göreceği kapsamla aynı —
 * geçişte filtreler silinir, kapsam kalır).
 */
export function scopeParamsOf(
  params: { get(name: string): string | null },
  names: readonly string[] = ORDERS_SCOPE_PARAMS,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = params.get(name);
    if (value) result[name] = value;
  }
  return result;
}

/** Takaslar listesinin okuduğu kapsam (API `userId` dışını tanımaz). */
export const TRADES_SCOPE_PARAMS = ["userId"] as const;
