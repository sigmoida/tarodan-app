import type { SelectOption } from "@tarodan/ui";
import { statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { statusFilterOptions } from "./types";

/** Package options are fetched by the page, so they arrive as an argument. */
export const boostPurchaseFilterFields = (
  t: TranslateFn,
  packageOptions: SelectOption[],
): FilterField[] => [
  {
    type: "select",
    name: "packageId",
    label: t("admin.shared.filterDialog.labels.package"),
    options: packageOptions,
  },
  statusField(t, statusFilterOptions(t)),
];
