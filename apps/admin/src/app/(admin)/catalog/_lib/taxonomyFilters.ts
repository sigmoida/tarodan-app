import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/**
 * Marka ve üretici listelerinin ortak filtre alanları: Durum + "İlanı
 * olanlar/olmayanlar". `hasListings` API'de "Aktif ilan" kolonuyla
 * (`activeListingCount`, mağaza sayacı) aynı kuralla çalışır; bu yüzden iki
 * liste de TEK tanımı paylaşır.
 */
export const taxonomyFilterFields = (
  t: TranslateFn,
  allLabel: string,
): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("common.status"),
    options: [
      { value: "all", label: allLabel },
      { value: "active", label: t("common.active") },
      { value: "inactive", label: t("common.inactive") },
    ],
  },
  {
    type: "select",
    name: "hasListings",
    label: t("admin.catalog.common.listingFilter"),
    options: [
      { value: "all", label: t("admin.catalog.common.allListings") },
      { value: "true", label: t("admin.catalog.common.withListings") },
      { value: "false", label: t("admin.catalog.common.withoutListings") },
    ],
  },
];
