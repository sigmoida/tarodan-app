import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { statusOptions } from "./orders";

export const orderFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions),
  dateRangeField(t, "fromDate", "toDate"),
];
