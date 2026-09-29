import {
  REFUND_REQUEST_KINDS,
  REFUND_REQUEST_KIND_I18N_KEYS,
} from "@tarodan/types";
import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { refundStatusOptions } from "@/lib/refund-request-query";

export const refundRequestFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, refundStatusOptions(t)),
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
  dateRangeField(t, "from", "to"),
];
