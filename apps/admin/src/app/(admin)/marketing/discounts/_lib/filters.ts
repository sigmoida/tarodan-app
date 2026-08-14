import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { scopeFilterOptions, activeFilterOptions } from "./types";

export const discountFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "scope",
    label: t("admin.shared.filterDialog.labels.scope"),
    options: scopeFilterOptions(t),
  },
  {
    type: "select",
    name: "isActive",
    label: t("admin.shared.filterDialog.labels.active"),
    options: activeFilterOptions(t),
  },
];
