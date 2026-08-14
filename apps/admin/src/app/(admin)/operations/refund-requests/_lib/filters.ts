import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { refundStatusOptions } from "@/lib/refund-request-query";

export const refundRequestFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, refundStatusOptions(t)),
  dateRangeField(t, "from", "to"),
];
