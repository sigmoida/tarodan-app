import type { SelectOption } from "@tarodan/ui";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/** Brand options come from the page (they need a query), the rest is static. */
export const carModelFilterFields = (
  t: TranslateFn,
  brandOptions: SelectOption[],
): FilterField[] => [
  {
    type: "select",
    name: "brandId",
    label: t("admin.shared.filterDialog.labels.brand"),
    options: brandOptions,
  },
];
