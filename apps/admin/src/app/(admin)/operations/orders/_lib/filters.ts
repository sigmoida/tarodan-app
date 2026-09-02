import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { orderOriginFilterOptions } from "@/lib/utils";
import { statusOptions } from "./orders";
import { offerStatusOptions } from "./offers";

export const orderFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
  {
    type: "select",
    name: "origin",
    label: t("admin.operations.orders.origin"),
    options: orderOriginFilterOptions(t),
  },
  dateRangeField(t, "fromDate", "toDate"),
];

export const offerFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, offerStatusOptions(t)),
  dateRangeField(t, "fromDate", "toDate"),
];
