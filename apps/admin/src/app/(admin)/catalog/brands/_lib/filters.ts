import type { FilterField, TranslateFn } from "@/components/list/filters/types";

export const brandFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("common.status"),
    options: [
      { value: "all", label: t("admin.catalog.brands.allBrands") },
      { value: "active", label: t("common.active") },
      { value: "inactive", label: t("common.inactive") },
    ],
  },
];
