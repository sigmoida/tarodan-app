import { RefundAttemptStatus } from "@prisma/client";
import {
  ProviderRefundNotSentException,
  ProviderRefundRejectedException,
} from "../../payment-providers/refund-errors";
import { errorMessage } from "../../../common/helpers/error-message";

/**
 * Prefix of `RefundAttempt.failureReason` when PayTR said nothing of the
 * payment is left to refund. The attempt waits in manual review; the status
 * inquiry must not requeue it (it would find no refund with our reference and
 * the refund would be resent and refused again, forever).
 */
export const REFUND_FAILURE_PROVIDER_NOTHING_LEFT = "provider_nothing_left";
/** Prefix of `RefundAttempt.failureReason` when the request never reached PayTR. */
export const REFUND_FAILURE_PROVIDER_NOT_SENT = "provider_not_sent";

export interface ProviderRefundFailure {
  /** The attempt's status after the failed provider call. */
  status:
    | typeof RefundAttemptStatus.failed
    | typeof RefundAttemptStatus.manual_review;
  /** Shown to admins in the reconciliation list; starts with a code where one applies. */
  failureReason: string;
  /**
   * True when the provider may hold or may have moved this refund's money: a
   * person (or the status inquiry) decides, the refund is not resent, and the
   * payout this call voided stays voided.
   */
  needsReconciliation: boolean;
}

/**
 * What a failed provider refund call leaves on its `RefundAttempt` (written
 * before the call). One rule for the order refund and the trade cash refund:
 *
 * | Provider outcome               | Attempt         | Resend?            |
 * | ------------------------------ | --------------- | ------------------ |
 * | not sent (connect phase)       | `failed`        | yes                |
 * | rejected                       | `failed`        | yes                |
 * | rejected, nothing left         | `manual_review` | after a human look |
 * | unknown (sent, no answer) / ?  | `manual_review` | after a human look |
 */
export function providerRefundFailure(error: unknown): ProviderRefundFailure {
  if (error instanceof ProviderRefundNotSentException) {
    return {
      status: RefundAttemptStatus.failed,
      failureReason: `${REFUND_FAILURE_PROVIDER_NOT_SENT}: ${error.detail}`,
      needsReconciliation: false,
    };
  }
  const reason = errorMessage(error) || "refund request failed";
  if (error instanceof ProviderRefundRejectedException) {
    return error.nothingLeftToRefund
      ? {
          status: RefundAttemptStatus.manual_review,
          failureReason: `${REFUND_FAILURE_PROVIDER_NOTHING_LEFT}: ${reason}`,
          needsReconciliation: true,
        }
      : {
          status: RefundAttemptStatus.failed,
          failureReason: reason,
          needsReconciliation: false,
        };
  }
  return {
    status: RefundAttemptStatus.manual_review,
    failureReason: reason,
    needsReconciliation: true,
  };
}

/**
 * PayTR refuses a refund of a payment it has not booked yet ("odeme henuz
 * siteye bildirilmemis"): the caller answers with a "try again in a minute"
 * message instead of PayTR's text.
 */
export function isPaymentNotYetSyncedRejection(reason: string): boolean {
  return /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
    reason,
  );
}
