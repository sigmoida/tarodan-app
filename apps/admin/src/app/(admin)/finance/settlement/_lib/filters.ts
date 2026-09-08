import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/** Dönem TESLİMAT tarihine göredir — hak ediş teslimatla doğar. */
export const settlementFilterFields = (t: TranslateFn): FilterField[] => [
  dateRangeField(t),
];
