import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { reportStatusOptions, reportTypeOptions } from "./types";

export const reportFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "type",
    label: t("admin.shared.filterDialog.labels.type"),
    options: reportTypeOptions(t),
  },
  statusField(t, reportStatusOptions(t)),
  dateRangeField(t),
];
