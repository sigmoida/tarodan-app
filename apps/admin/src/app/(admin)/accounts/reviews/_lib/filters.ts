import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { reviewStatusOptions } from "./types";

/** Both review tabs (product + seller) filter identically. */
export const reviewFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, reviewStatusOptions(t)),
  dateRangeField(t),
];
