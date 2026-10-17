import {
  REFUND_REQUEST_KINDS,
  REFUND_REQUEST_KIND_I18N_KEYS,
} from "@tarodan/types";
import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/** İadeler listesinin tarih aralığı anahtarları (API `dateFrom` / `dateTo`). */
export const REFUND_DATE_FROM = "dateFrom";
export const REFUND_DATE_TO = "dateTo";

/**
 * Durum filtresi yok: durum alt sekmenin işidir. Arama (iade no, sipariş no,
 * takip no, alıcı / satıcı adı) toolbar'ın arama kutusundadır.
 */
export const refundFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "kind",
    label: t("admin.operations.refundRequests.kind.label"),
    options: [
      { value: "all", label: t("admin.operations.refundRequests.kind.all") },
      ...REFUND_REQUEST_KINDS.map((kind) => ({
        value: kind,
        label: t(REFUND_REQUEST_KIND_I18N_KEYS[kind]),
      })),
    ],
  },
  dateRangeField(t, REFUND_DATE_FROM, REFUND_DATE_TO),
];
