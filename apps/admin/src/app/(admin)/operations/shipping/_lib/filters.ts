import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { refundStatusOptions } from "@/lib/refund-request-query";
import { statusOptions, legOptions } from "../_shared";

export const orderShipmentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
];

export const tradeShipmentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
  {
    type: "select",
    name: "leg",
    label: t("admin.shared.filterDialog.labels.shipmentLeg"),
    options: legOptions(t),
  },
];

export const returnShipmentFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, refundStatusOptions(t)),
  dateRangeField(t, "from", "to"),
];

export const suratFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, statusOptions(t)),
];

export const carrierCancellationFilterFields = (
  t: TranslateFn,
): FilterField[] => [
  {
    type: "select",
    name: "status",
    label: t("common.status"),
    // This list opens on "pending", not on the first option — so the badge
    // counts it as unfiltered until the admin picks something else.
    defaultValue: "pending",
    options: [
      { value: "all", label: t("common.all") },
      {
        value: "pending",
        label: t("admin.operations.shipping.cancellations.status.pending"),
      },
      {
        value: "resolved",
        label: t("admin.operations.shipping.cancellations.status.resolved"),
      },
      {
        value: "dismissed",
        label: t("admin.operations.shipping.cancellations.status.dismissed"),
      },
    ],
  },
];
