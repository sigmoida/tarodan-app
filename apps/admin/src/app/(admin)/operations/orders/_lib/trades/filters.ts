import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { adminCancelReasonFilterOptions } from "@/lib/admin-cancel-reasons";
import { statusOptions } from "./trades";

export const tradeFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
  // Platform (admin) iptalleri katalog koduna göre (Trade.adminCancelReasonCode).
  {
    type: "select",
    name: "adminCancelReasonCode",
    label: t("admin.operations.trades.adminCancel.reasonFilter"),
    options: adminCancelReasonFilterOptions(t),
  },
  dateRangeField(t, "fromDate", "toDate"),
];
