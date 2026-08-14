import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  ticketStatusOptions,
  ticketPriorityOptions,
  ticketCategoryOptions,
} from "./types";

export const ticketFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, ticketStatusOptions(t)),
  {
    type: "select",
    name: "priority",
    label: t("admin.shared.filterDialog.labels.priority"),
    options: ticketPriorityOptions(t),
  },
  {
    type: "select",
    name: "category",
    label: t("common.category"),
    options: ticketCategoryOptions(t),
  },
  dateRangeField(t, "fromDate", "toDate"),
];
