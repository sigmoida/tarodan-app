import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { messageFilterOptions } from "./types";

export const messageFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("common.status"),
    // The list opens on the moderation queue ("pending"), not on "all" — so
    // that is the unfiltered baseline and the badge stays at 0 until changed.
    defaultValue: "pending",
    options: messageFilterOptions(t),
  },
  dateRangeField(t, "fromDate", "toDate"),
];
