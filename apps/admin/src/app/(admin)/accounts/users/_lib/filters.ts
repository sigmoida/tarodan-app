import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import {
  getMembershipTierFilterOptions,
  getMembershipLifecycleOptions,
  getLoginStateFilterOptions,
} from "./types";

/** Hesap durumu ve kullanıcı türü filtre DEĞİLDİR: durum sekmedir, tür kolon/filtre olarak kaldırıldı. */
export const userFilterFields = (t: TranslateFn): FilterField[] => [
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
  {
    type: "select",
    name: "loginState",
    label: t("admin.shared.filterDialog.labels.loginState"),
    options: getLoginStateFilterOptions(t),
  },
  dateRangeField(t),
];
