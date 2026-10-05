/**
 * Escrow / payout hold-reason helpers.
 *
 * Rule (mirrors the backend): payout to the seller happens at the hold's
 * `releaseAt` = delivery + the order's return window + payout grace. The server
 * stamps `PaymentHold.releaseAt` at delivery; NO payout on approval/payment.
 * While a refund is open the hold is locked via frozenByRefundId and cannot be
 * released.
 *
 * This module is a read-only UI derivation. It NEVER recomputes a date from
 * constants: the real release date comes from the server row (`releaseAt`), the
 * window length quoted in the label comes from the Durations & Rules policy
 * (`GET /timing-rules`, see `hooks/useTimingPolicy`).
 */

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
  /**
   * Real release date stamped by the server at delivery. Absent = the order
   * has not been delivered yet (the escrow clock hasn't started).
   */
  releaseAt?: string | Date | null;
  /** Return window in days, quoted in the "not elapsed" label (policy value). */
  returnWindowDays: number;
  /** Comparison instant (for testability). */
  now?: Date;
}

/**
 * Why is a hold waiting? Priority order:
 *   frozen > open refund > not delivered > release date not reached > ready.
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

  const release = input.releaseAt ? new Date(input.releaseAt) : null;

  if (!release) {
    return {
      code: "not_delivered",
      label: t("admin.shared.escrow.reasons.notDelivered.label"),
      detail: t("admin.shared.escrow.reasons.notDelivered.detail"),
      tone: "warning",
    };
  }

  if (release.getTime() > now.getTime()) {
    return {
      code: "window_not_elapsed",
      label: t("admin.shared.escrow.reasons.windowNotElapsed.label", {
        days: input.returnWindowDays,
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
