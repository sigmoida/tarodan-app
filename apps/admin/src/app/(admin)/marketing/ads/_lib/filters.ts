import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { positionFilterOptions, deviceFilterOptions } from "./types";

export const adFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "position",
    label: t("admin.shared.filterDialog.labels.position"),
    options: positionFilterOptions(t),
  },
  {
    type: "select",
    name: "device",
    label: t("admin.shared.filterDialog.labels.device"),
    options: deviceFilterOptions(t),
  },
];
