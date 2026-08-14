import { statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { channelFilterOptions, deliveryFilterOptions } from "./types";

export const notificationHistoryFilterFields = (
  t: TranslateFn,
): FilterField[] => [
  {
    type: "select",
    name: "channel",
    label: t("admin.shared.filterDialog.labels.channel"),
    options: channelFilterOptions(t),
  },
  statusField(t, deliveryFilterOptions(t)),
];
