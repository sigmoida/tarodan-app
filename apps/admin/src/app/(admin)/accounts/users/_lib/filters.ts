import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  getUserFilterOptions,
  getMembershipTierFilterOptions,
  getMembershipLifecycleOptions,
} from "./types";

export const userFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "filter",
    label: t("admin.shared.filterDialog.labels.userType"),
    options: getUserFilterOptions(t),
  },
  {
    type: "select",
    name: "membershipTier",
    label: t("admin.shared.filterDialog.labels.membershipTier"),
    options: getMembershipTierFilterOptions(t),
  },
  {
    type: "select",
    name: "lifecycle",
    label: t("admin.shared.filterDialog.labels.lifecycle"),
    options: getMembershipLifecycleOptions(t),
  },
  dateRangeField(t),
];
