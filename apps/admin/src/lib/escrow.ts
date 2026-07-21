/**
 * Escrow / payout scheduling helpers (new escrow model).
 *
 * Rule (mirrors the backend): payout to seller = delivery (deliveredAt) + 14-day
 * refund window + 1-day grace. NO payout on approval/payment; PaymentHold.releaseAt
 * is set at delivery. While a refund is open the hold is locked via frozenByRefundId
 * and cannot be released.
 *
 * This module is a read-only UI computation — the backend writes the real release
 * date. The date derived from deliveredAt is shown as an "estimated release"; if the
 * payout list has a releaseAt, that real value takes precedence.
 */

/** Refund window: 14 days of unconditional returns after delivery. */
export const REFUND_WINDOW_DAYS = 14;
/** 1-day grace after the window closes, before payout. */
export const PAYOUT_GRACE_DAYS = 1;
/** Total days from delivery to release (14 + 1). */
export const ESCROW_RELEASE_DAYS = REFUND_WINDOW_DAYS + PAYOUT_GRACE_DAYS;

const DAY_MS = 86_400_000;

/**
 * deliveredAt + 14 + 1 days → estimated release date.
 * Null if no deliveredAt (not yet delivered → escrow clock hasn't started).
 */
export function computeEstimatedReleaseAt(
  deliveredAt: string | Date | null | undefined,
): Date | null {
  if (!deliveredAt) return null;
  const base = new Date(deliveredAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + ESCROW_RELEASE_DAYS * DAY_MS);
}

/** End date of the refund window (delivery + 14 days). */
export function computeRefundWindowEnd(
  deliveredAt: string | Date | null | undefined,
): Date | null {
  if (!deliveredAt) return null;
  const base = new Date(deliveredAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + REFUND_WINDOW_DAYS * DAY_MS);
}

export type EscrowHoldReasonCode =
  "frozen" | "open_refund" | "window_not_elapsed" | "not_delivered" | "ready";

export interface EscrowHoldReason {
  code: EscrowHoldReasonCode;
  /** Short badge label. */
  label: string;
  /** One-sentence description. */
  detail: string;
  /** Badge tone (for picking the tailwind class group). */
  tone: "danger" | "warning" | "info" | "success";
}

export interface EscrowHoldReasonInput {
  /** Is the hold's frozenByRefundId set (atomic lock). */
  frozen?: boolean;
  /** Is there an open refund request for the order/hold. */
  hasOpenRefund?: boolean;
  /** Delivery date (start of the escrow clock). */
  deliveredAt?: string | Date | null;
  /** Real release date (takes precedence if the backend wrote it). */
  releaseAt?: string | Date | null;
  /** Comparison instant (for testability). */
  now?: Date;
}

/**
 * Why is a hold waiting? Priority order:
 *   frozen > open refund > delivery+14 not elapsed > not delivered > ready.
 */
export function describeHoldReason(
  input: EscrowHoldReasonInput,
  t: T,
): EscrowHoldReason {
  const now = input.now ?? new Date();

  if (input.frozen) {
    return {
      code: "frozen",
      label: t("admin.shared.escrow.reasons.frozen.label"),
      detail: t("admin.shared.escrow.reasons.frozen.detail"),
      tone: "danger",
    };
  }

  if (input.hasOpenRefund) {
    return {
      code: "open_refund",
      label: t("admin.shared.escrow.reasons.openRefund.label"),
      detail: t("admin.shared.escrow.reasons.openRefund.detail"),
      tone: "danger",
    };
  }

  const release = input.releaseAt
    ? new Date(input.releaseAt)
    : computeEstimatedReleaseAt(input.deliveredAt);

  if (!input.deliveredAt && !input.releaseAt) {
    return {
      code: "not_delivered",
      label: t("admin.shared.escrow.reasons.notDelivered.label"),
      detail: t("admin.shared.escrow.reasons.notDelivered.detail"),
      tone: "warning",
    };
  }

  if (release && release.getTime() > now.getTime()) {
    return {
      code: "window_not_elapsed",
      label: t("admin.shared.escrow.reasons.windowNotElapsed.label", {
        days: REFUND_WINDOW_DAYS,
      }),
      detail: t("admin.shared.escrow.reasons.windowNotElapsed.detail", {
        date: release.toLocaleDateString(t("common.dateLocale"), {
          dateStyle: "medium",
        }),
      }),
      tone: "info",
    };
  }

  return {
    code: "ready",
    label: t("admin.shared.escrow.reasons.ready.label"),
    detail: t("admin.shared.escrow.reasons.ready.detail"),
    tone: "success",
  };
}

/** Turkish badge label for Order.cancellationType (iptal | iade). */
export function cancellationTypeLabel(
  type: string | null | undefined,
  t: T,
): { label: string; detail: string } | null {
  if (!type) return null;
  if (type === "iptal") {
    return {
      label: t("admin.shared.escrow.cancellation.beforeShipping.label"),
      detail: t("admin.shared.escrow.cancellation.beforeShipping.detail"),
    };
  }
  if (type === "iade") {
    return {
      label: t("admin.shared.escrow.cancellation.afterShipping.label"),
      detail: t("admin.shared.escrow.cancellation.afterShipping.detail"),
    };
  }
  return { label: type, detail: "" };
}
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;
