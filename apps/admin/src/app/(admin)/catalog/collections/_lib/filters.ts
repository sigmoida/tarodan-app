import type { FilterField, TranslateFn } from "@/components/list/filters/types";

export const collectionFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "isPublic",
    label: t("admin.shared.filterDialog.labels.visibility"),
    options: [
      { value: "all", label: t("admin.catalog.collections.allVisibility") },
      { value: "true", label: t("admin.catalog.collections.visible") },
      { value: "false", label: t("admin.catalog.collections.hidden") },
    ],
  },
  {
    type: "select",
    name: "isFeatured",
    label: t("admin.shared.filterDialog.labels.featured"),
    options: [
      { value: "all", label: t("common.all") },
      { value: "true", label: t("admin.catalog.collections.featured") },
    ],
  },
];
