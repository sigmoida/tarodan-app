/**
 * Guidance/label maps for the Refund Request detail page.
 * Pure data + i18n resolvers — no UI. Used by page.tsx + RefundStatusStepper + RefundNextActionPanel.
 */
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Lifecycle phases (stepper order). Buyer-remorse requests advance
 * automatically; fault claims remain at the received phase until admin review.
 */
export function refundLifecycle(t: T): string[] {
  return [
    t("admin.operations.refundRequests.lifecycle.received"),
    t("admin.operations.refundRequests.lifecycle.returnShipment"),
    t("admin.operations.refundRequests.lifecycle.productInTransit"),
    t("admin.operations.refundRequests.lifecycle.productAtSeller"),
    t("admin.operations.refundRequests.lifecycle.refunded"),
  ];
}

/** RefundRequestStatus → active phase index (into the refund lifecycle). */
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

export type GuidanceVariant =
  "default" | "info" | "success" | "warning" | "danger";

export interface RefundGuidance {
  variant: GuidanceVariant;
  title: string;
  description: string;
  /** If true, the admin must take a manual action (action button is shown). */
  actionNeeded: boolean;
}

/** The "what should you do now?" text for each state. */
export function guidanceForStatus(t: T, status: string): RefundGuidance {
  const map: Record<string, RefundGuidance> = {
    pending_review: {
      variant: "warning",
      title: t("admin.operations.refundRequests.guidance.pendingReview.title"),
      description: t(
        "admin.operations.refundRequests.guidance.pendingReview.description",
      ),
      actionNeeded: true,
    },
    approved: {
      variant: "info",
      title: t("admin.operations.refundRequests.guidance.approved.title"),
      description: t(
        "admin.operations.refundRequests.guidance.approved.description",
      ),
      actionNeeded: false,
    },
    wait_for_delivery: {
      variant: "info",
      title: t(
        "admin.operations.refundRequests.guidance.waitForDelivery.title",
      ),
      description: t(
        "admin.operations.refundRequests.guidance.waitForDelivery.description",
      ),
      actionNeeded: false,
    },
    return_shipment_open: {
      variant: "info",
      title: t(
        "admin.operations.refundRequests.guidance.returnShipmentOpen.title",
      ),
      description: t(
        "admin.operations.refundRequests.guidance.returnShipmentOpen.description",
      ),
      actionNeeded: false,
    },
    return_in_transit: {
      variant: "info",
      title: t(
        "admin.operations.refundRequests.guidance.returnInTransit.title",
      ),
      description: t(
        "admin.operations.refundRequests.guidance.returnInTransit.description",
      ),
      actionNeeded: false,
    },
    return_delivered: {
      variant: "warning",
      title: t(
        "admin.operations.refundRequests.guidance.returnDelivered.title",
      ),
      description: t(
        "admin.operations.refundRequests.guidance.returnDelivered.description",
      ),
      actionNeeded: true,
    },
    refunded: {
      variant: "success",
      title: t("admin.operations.refundRequests.guidance.refunded.title"),
      description: t(
        "admin.operations.refundRequests.guidance.refunded.description",
      ),
      actionNeeded: false,
    },
    rejected: {
      variant: "danger",
      title: t("admin.operations.refundRequests.guidance.rejected.title"),
      description: t(
        "admin.operations.refundRequests.guidance.rejected.description",
      ),
      actionNeeded: false,
    },
    cancelled: {
      variant: "default",
      title: t("admin.operations.refundRequests.guidance.cancelled.title"),
      description: t(
        "admin.operations.refundRequests.guidance.cancelled.description",
      ),
      actionNeeded: false,
    },
  };

  return (
    map[status] ?? {
      variant: "default",
      title: t("common.status"),
      description: t(
        "admin.operations.refundRequests.guidance.default.description",
      ),
      actionNeeded: false,
    }
  );
}

/** Who pays for the return shipping — label + description. */
export function payerLabel(
  t: T,
  payer: string,
): { label: string; helper: string } | undefined {
  const map: Record<string, { label: string; helper: string }> = {
    buyer: {
      label: t("admin.operations.refundRequests.payer.buyer.label"),
      helper: t("admin.operations.refundRequests.payer.buyer.helper"),
    },
    seller: {
      label: t("admin.operations.refundRequests.payer.seller.label"),
      helper: t("admin.operations.refundRequests.payer.seller.helper"),
    },
    platform: {
      label: t("admin.operations.refundRequests.payer.platform.label"),
      helper: t("admin.operations.refundRequests.payer.platform.helper"),
    },
  };
  return map[payer];
}

/** Audit history action code → readable label + actor. */
export function refundActionLabel(
  t: T,
  action: string,
): { label: string; actor: string } {
  const buyer = t("admin.operations.refundRequests.actor.buyer");
  const seller = t("admin.operations.refundRequests.actor.seller");
  const admin = t("admin.operations.refundRequests.actor.admin");
  const system = t("admin.operations.refundRequests.actor.system");

  const map: Record<string, { label: string; actor: string }> = {
    cancelled_by_buyer: {
      label: t("admin.operations.refundRequests.actionLabel.cancelledByBuyer"),
      actor: buyer,
    },
    accepted_by_seller: {
      label: t("admin.operations.refundRequests.actionLabel.acceptedBySeller"),
      actor: seller,
    },
    rejected_by_seller: {
      label: t("admin.operations.refundRequests.actionLabel.rejectedBySeller"),
      actor: seller,
    },
    dispute_resolved_approve: {
      label: t("admin.operations.refundRequests.actionLabel.disputeApproved"),
      actor: admin,
    },
    dispute_resolved_reject: {
      label: t("admin.operations.refundRequests.actionLabel.disputeRejected"),
      actor: admin,
    },
    return_opened: {
      label: t("admin.operations.refundRequests.actionLabel.returnOpened"),
      actor: system,
    },
    refund_completed: {
      label: t("admin.operations.refundRequests.actionLabel.refundCompleted"),
      actor: system,
    },
    policy_overridden: {
      label: t("admin.operations.refundRequests.actionLabel.policyOverridden"),
      actor: admin,
    },
    return_shipping_payer_changed: {
      label: t("admin.operations.refundRequests.actionLabel.payerChanged"),
      actor: admin,
    },
  };

  return (
    map[action] ?? {
      label: action.replace(/_/g, " "),
      actor: "—",
    }
  );
}
