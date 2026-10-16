import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { positionFilterOptions, platformFilterOptions } from "./types";

export const adFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "position",
    label: t("admin.shared.filterDialog.labels.position"),
    options: positionFilterOptions(t),
  },
  {
    type: "select",
    name: "platform",
    label: t("admin.shared.filterDialog.labels.platform"),
    options: platformFilterOptions(t),
  },
];
