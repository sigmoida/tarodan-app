import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { paymentStatusFilterOptions, providerFilterOptions } from "./types";

export const paymentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, paymentStatusFilterOptions(t)),
  {
    type: "select",
    name: "provider",
    label: t("admin.shared.filterDialog.labels.provider"),
    options: providerFilterOptions(t),
  },
  dateRangeField(t),
];
