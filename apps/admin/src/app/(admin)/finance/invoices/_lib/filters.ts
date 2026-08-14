import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  typeFilterOptions,
  statusFilterOptions,
  documentTypeFilterOptions,
} from "./types";

export const elogoInvoiceFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "type",
    label: t("admin.shared.filterDialog.labels.type"),
    options: typeFilterOptions(t),
  },
  statusField(t, statusFilterOptions(t)),
  {
    type: "select",
    name: "documentType",
    label: t("admin.shared.filterDialog.labels.documentType"),
    options: documentTypeFilterOptions(t),
  },
  dateRangeField(t),
];

export const sellerInvoiceFilterFields = (t: TranslateFn): FilterField[] => [
  dateRangeField(t),
];
