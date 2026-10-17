import {
  GIB_LISTING_STATUSES,
  GIB_LISTING_STATUS_I18N_KEYS,
  GIB_SELLER_KINDS,
  GIB_SELLER_KIND_I18N_KEYS,
} from "@tarodan/types";
import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/**
 * Seçenekler paylaşılan GİB kataloğundan türetilir (API'nin kabul ettiği
 * değerlerin aynısı); ilk seçenek "Tümü" (`all`, istekten düşer). Tarih
 * aralığı ilanın YAYIN tarihi (`publishedAt`) üzerindendir.
 */
const withAll = (
  t: TranslateFn,
  options: Array<{ value: string; label: string }>,
) => [{ value: "all", label: t("common.all") }, ...options];

export const gibReportFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("admin.gibReport.filters.status"),
    options: withAll(
      t,
      GIB_LISTING_STATUSES.map((status) => ({
        value: status,
        label: t(GIB_LISTING_STATUS_I18N_KEYS[status]),
      })),
    ),
  },
  {
    type: "select",
    name: "sellerKind",
    label: t("admin.gibReport.filters.sellerKind"),
    options: withAll(
      t,
      GIB_SELLER_KINDS.map((kind) => ({
        value: kind,
        label: t(GIB_SELLER_KIND_I18N_KEYS[kind]),
      })),
    ),
  },
  {
    type: "select",
    name: "identityIncomplete",
    label: t("admin.gibReport.filters.identityIncomplete"),
    options: withAll(t, [
      {
        value: "true",
        label: t("admin.gibReport.filters.identityIncompleteOnly"),
      },
    ]),
  },
  dateRangeField(t),
];
