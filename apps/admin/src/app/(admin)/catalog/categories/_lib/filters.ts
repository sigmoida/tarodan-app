import type { FilterField, TranslateFn } from "@/components/list/filters/types";

export const categoryFilterFields = (t: TranslateFn): FilterField[] => [
  { type: "dateRange", label: t("admin.shared.filterDialog.labels.dateRange") },
];
