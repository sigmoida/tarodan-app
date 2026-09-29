import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { statusOptions } from "./trades";

export const tradeFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
  dateRangeField(t, "fromDate", "toDate"),
];
