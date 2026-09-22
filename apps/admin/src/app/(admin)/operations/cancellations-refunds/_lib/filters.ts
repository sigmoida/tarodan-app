import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/**
 * İptaller sekmesinin filtreleri. Her kod kendi alanında aranır (bkz. API
 * `cancellation-where.ts`); tarih aralığı İPTAL anına uygulanır. Sekme ve alt
 * sekme filtre değil, liste kapsamıdır (URL `?tab=` / `?bucket=`).
 */
export const cancellationFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "text",
    name: "orderNumber",
    label: t("admin.operations.cancellations.filters.orderNumber"),
  },
  {
    type: "text",
    name: "cargoCode",
    label: t("admin.operations.cancellations.filters.cargoCode"),
  },
  {
    type: "text",
    name: "groupNumber",
    label: t("admin.operations.cancellations.filters.groupNumber"),
  },
  {
    type: "text",
    name: "party",
    label: t("admin.operations.cancellations.filters.party"),
    placeholder: t("admin.operations.cancellations.filters.partyPlaceholder"),
  },
  {
    ...dateRangeField(t),
    label: t("admin.operations.cancellations.filters.cancelledDate"),
  },
];
