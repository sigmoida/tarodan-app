/** @format */

import type { BadgeVariant } from "@tarodan/ui";
import type { MessageKey } from "@tarodan/i18n";

/**
 * Single source of truth for refund-request labels shared by the list and the
 * detail page (previously each kept its own copy). Labels are catalog keys
 * (resolved via `t()` at the call site) so the marketplace can switch locale.
 */

export interface RefundStatusMeta {
  labelKey: MessageKey;
  variant: BadgeVariant;
}

/** RefundRequestStatus → Badge variant + catalog label key. */
export const refundStatusMeta: Record<string, RefundStatusMeta> = {
  pending_review: {
    labelKey: "refund.statusPendingReview",
    variant: "warning",
  },
  approved: { labelKey: "refund.statusApproved", variant: "info" },
  wait_for_delivery: {
    labelKey: "refund.statusWaitForDelivery",
    variant: "info",
  },
  return_shipment_open: {
    labelKey: "refund.statusReturnShipmentOpen",
    variant: "info",
  },
  return_in_transit: {
    labelKey: "refund.statusReturnInTransit",
    variant: "info",
  },
  return_delivered: {
    labelKey: "refund.statusReturnDelivered",
    variant: "info",
  },
  refunded: { labelKey: "refund.statusRefunded", variant: "success" },
  rejected: { labelKey: "common.rejected", variant: "danger" },
  disputed: { labelKey: "refund.statusDisputed", variant: "warning" },
  cancelled: { labelKey: "order.statusCancelled", variant: "secondary" },
};

/** Meta for a status, or `null` labelKey (caller falls back to the raw status). */
export function statusMetaOf(status: string): {
  labelKey: MessageKey | null;
  variant: BadgeVariant;
} {
  return refundStatusMeta[status] ?? { labelKey: null, variant: "secondary" };
}

/** RefundReason → catalog label key. */
export const refundReasonLabelKey: Record<string, MessageKey> = {
  changed_mind: "order.refundReasonChangedMind",
  damaged: "order.refundReasonDamaged",
  wrong_item: "order.refundReasonWrongItem",
  not_as_described: "order.refundReasonNotAsDescribed",
  missing_parts: "order.refundReasonMissingParts",
  counterfeit: "order.refundReasonCounterfeit",
  lost_in_transit: "order.refundReasonLostInTransit",
  other: "order.refundReasonOther",
};

/** Reason label key, or `null` (caller falls back to the raw reason). */
export function reasonLabelKeyOf(reason: string): MessageKey | null {
  return refundReasonLabelKey[reason] ?? null;
}

/**
 * Lifecycle phases for the status stepper (catalog keys) — aligned with admin's
 * automatic flow (no human "review/approval" step; a request goes straight to
 * the return phase).
 */
export const REFUND_LIFECYCLE: MessageKey[] = [
  "refund.requestReceived",
  "trade.returnShipment",
  "refund.lifecycleInTransit",
  "refund.lifecycleAtSeller",
  "refund.lifecycleRefunded",
];

/** RefundRequestStatus → active phase index (into REFUND_LIFECYCLE). */
export const refundStatusPhase: Record<string, number> = {
  pending_review: 0,
  approved: 1,
  wait_for_delivery: 1,
  return_shipment_open: 1,
  return_in_transit: 2,
  return_delivered: 3,
  refunded: 4,
};

/** Off-flow (terminal) states — shown as a red end-cap in the stepper. */
export const refundTerminalStatuses = new Set(["rejected", "cancelled"]);
