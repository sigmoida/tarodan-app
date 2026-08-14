import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  payoutStatusFilterOptions,
  transferStatusFilterOptions,
  adjustmentStatusFilterOptions,
} from "./types";

export const payoutTransactionFilterFields = (
  t: TranslateFn,
): FilterField[] => [
  statusField(t, payoutStatusFilterOptions(t)),
  dateRangeField(t, "dateFrom", "dateTo"),
];

export const payoutTransferFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, transferStatusFilterOptions(t)),
  dateRangeField(t, "dateFrom", "dateTo"),
];

export const payoutAdjustmentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, adjustmentStatusFilterOptions(t)),
];
