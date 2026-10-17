import {
  ADMIN_CANCELLATION_ADMIN_REASON_ANY,
  ADMIN_CANCEL_REASON_CODES,
  ADMIN_CANCEL_REASON_I18N_KEYS,
} from "@tarodan/types";
import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/** "Tümü" — süzgeç yok (değer API'ye gönderilmez). */
const ADMIN_REASON_ALL = "all";

/**
 * "Yönetici iptali" süzgeci: tümü / bütün yönetici iptalleri / tek bir
 * katalog nedeni. Seçenekler paylaşılan neden kataloğundan gelir.
 */
export const adminReasonFilterField = (t: TranslateFn): FilterField => ({
  type: "select",
  name: "adminReason",
  label: t("admin.operations.cancellations.filters.adminReason"),
  defaultValue: ADMIN_REASON_ALL,
  options: [
    {
      value: ADMIN_REASON_ALL,
      label: t("admin.operations.cancellations.filters.adminReasonAll"),
    },
    {
      value: ADMIN_CANCELLATION_ADMIN_REASON_ANY,
      label: t("admin.operations.cancellations.filters.adminReasonAny"),
    },
    ...ADMIN_CANCEL_REASON_CODES.map((code) => ({
      value: code,
      label: t(ADMIN_CANCEL_REASON_I18N_KEYS[code]),
    })),
  ],
});

/**
 * İptaller sekmesinin filtreleri. Her kod kendi alanında aranır (bkz. API
 * `cancellation-where.ts`); tarih aralığı İPTAL anına uygulanır. Sekme ve alt
 * sekme filtre değil, liste kapsamıdır (URL `?tab=` / `?bucket=`).
 */
export const cancellationFilterFields = (t: TranslateFn): FilterField[] => [
  adminReasonFilterField(t),
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
