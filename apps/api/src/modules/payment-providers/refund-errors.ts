import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

export class ProviderRefundRejectedException extends BadRequestException {
  readonly providerOutcome = "rejected" as const;
}

export class ProviderRefundOutcomeUnknownException extends ServiceUnavailableException {
  readonly providerOutcome = "unknown" as const;
}

export class RefundPendingReconciliationException extends ServiceUnavailableException {
  readonly refundPendingReconciliation = true;
}

/**
 * The attempt claim refused this call before it sent anything because a
 * different attempt of the same order (another idempotency key) is still
 * unresolved. The money question is that attempt's, not this call's, so a
 * caller recording outcomes must not write it as its own pending refund.
 * (A refusal on this call's own key stays a plain
 * `RefundPendingReconciliationException`: that attempt is this intent's.)
 * Same HTTP answer and handling as its parent.
 */
export class RefundAttemptInFlightException extends RefundPendingReconciliationException {
  readonly refundAttemptInFlight = true;
}
