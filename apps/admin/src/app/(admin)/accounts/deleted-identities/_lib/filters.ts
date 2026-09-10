import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { getBooleanFilterOptions, getSourceFilterOptions } from "./types";

/**
 * Tarih aralığı `deletedAt` üzerinden çalışır (arşiv satırının createdAt'i
 * değil) — backfill satırlarının hepsi aynı güne düştüğü için tersi dönem
 * raporunu makul görünen bir biçimde yanlış yapardı.
 */
export const deletedIdentityFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "source",
    label: t("admin.deletedIdentities.filterSource"),
    options: getSourceFilterOptions(t),
  },
  {
    type: "select",
    name: "wasSeller",
    label: t("admin.deletedIdentities.filterWasSeller"),
    options: getBooleanFilterOptions(t),
  },
  {
    type: "select",
    name: "retentionExpired",
    label: t("admin.deletedIdentities.filterRetentionExpired"),
    options: getBooleanFilterOptions(t),
  },
  dateRangeField(t),
];
