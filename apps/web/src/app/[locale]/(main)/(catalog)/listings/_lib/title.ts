/** @format */

import type { Translate } from "@/types/i18n";
import type { Filters } from "./params";

/** Popüler ilanlar ön ayarının sıralama değeri (nav "Çok Satanlar" + ana sayfa
 *  "Popüler İlanlar" rayı bu URL'e gider). */
export const POPULAR_SORT = "view_count_desc";

type TitleFilters = Pick<
  Filters,
  | "tradeOnly"
  | "discountOnly"
  | "sortBy"
  | "brand"
  | "category"
  | "manufacturer"
>;

/**
 * İlanlar sayfasının başlığı — canlı filtre durumundan türetilir, böylece bir
 * çip kaldırılınca başlık da değişir. Öncelik: arama → takas vitrini →
 * indirimdekiler → popüler → marka/kategori/üretici adı → tüm ilanlar.
 * Mobil uygulama aynı kuralı uygular; sırayı değiştirirken ikisini birlikte güncelle.
 */
export function getListingsTitle(
  t: Translate,
  search: string,
  filters: TitleFilters,
): string {
  if (search) return t("product.searchResultsFor", { query: search });
  if (filters.tradeOnly) return t("nav.tradeShowcase");
  if (filters.discountOnly) return t("product.onSale");
  if (filters.sortBy === POPULAR_SORT) return t("home.popularListings");
  return (
    filters.brand ||
    filters.category ||
    filters.manufacturer ||
    t("seller.allListings")
  );
}
