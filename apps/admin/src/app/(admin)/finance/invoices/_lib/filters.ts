import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  typeFilterOptions,
  statusFilterOptions,
  documentTypeFilterOptions,
  contextFilterOptions,
} from "./types";

/**
 * Fatura listesinin filtreleri.
 *
 * Numara, açıklama ve kullanıcı kodu AYRI metin alanlarıdır, toolbar'ın tek
 * arama kutusuna yığılmaz: operatör hangi kolonu aradığını bilir ve hepsini
 * birden eşleştiren bir arama dar sorguyu imkânsız kılar (bir fatura numarası
 * bir kullanıcı kodu değildir).
 */
export const elogoInvoiceFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "text",
    name: "invoiceNumber",
    label: t("admin.finance.invoices.filters.invoiceNumber"),
  },
  {
    type: "text",
    name: "description",
    label: t("admin.finance.invoices.filters.description"),
    placeholder: t("admin.finance.invoices.filters.descriptionPlaceholder"),
  },
  {
    type: "text",
    name: "userCode",
    label: t("admin.finance.invoices.filters.userCode"),
    placeholder: t("admin.finance.invoices.filters.userCodePlaceholder"),
  },
  {
    type: "select",
    name: "context",
    label: t("admin.finance.invoices.context"),
    options: contextFilterOptions(t),
  },
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
