import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  payoutStatusFilterOptions,
  transferStatusFilterOptions,
  adjustmentStatusFilterOptions,
  earlyReleaseFilterOptions,
  overdueFilterOptions,
} from "./types";

export const payoutTransactionFilterFields = (
  t: TranslateFn,
): FilterField[] => [
  statusField(t, payoutStatusFilterOptions(t)),
  dateRangeField(t, "dateFrom", "dateTo"),
  {
    type: "select",
    name: "earlyReleased",
    label: t("admin.finance.payouts.filterReleaseTiming"),
    options: earlyReleaseFilterOptions(t),
  },
  {
    type: "select",
    name: "overdue",
    label: t("admin.finance.payouts.filterDue"),
    options: overdueFilterOptions(t),
  },
];

export const payoutTransferFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, transferStatusFilterOptions(t)),
  dateRangeField(t, "dateFrom", "dateTo"),
];

export const payoutAdjustmentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, adjustmentStatusFilterOptions(t)),
];
