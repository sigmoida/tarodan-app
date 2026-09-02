import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { offerStatusOptions } from "./offers";

export const offerFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, offerStatusOptions(t)),
  dateRangeField(t, "fromDate", "toDate"),
];
