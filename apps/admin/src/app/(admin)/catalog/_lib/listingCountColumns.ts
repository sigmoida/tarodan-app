import type { useTranslations } from "next-intl";
import { col } from "@/components/table";

type T = ReturnType<typeof useTranslations<never>>;

/** API'nin marka/üretici satırına eklediği ilan sayaçları. */
export interface ListingCounts {
  /** Toplam ilan (her statü). */
  listingCount: number;
  /** Vitrinde sayılan aktif ilan — mağaza sayacıyla aynı tanım. */
  activeListingCount: number;
}

/**
 * Marka ve üretici tablolarının ilan sayacı kolonları — tek kaynak. Anahtar
 * erişimci kolonu sıralanabilir yapar; API iki anahtarı da tanır
 * (`listingCount` DB'de, `activeListingCount` hesaplanarak sıralanır).
 */
export function listingCountColumns<R extends ListingCounts>(t: T) {
  return [
    col.number<R>(
      t("admin.catalog.common.activeListingCount"),
      "activeListingCount",
    ),
    col.number<R>(t("admin.catalog.common.listingCount"), "listingCount"),
  ];
}
