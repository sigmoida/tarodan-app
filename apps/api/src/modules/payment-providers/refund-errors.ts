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
 * The attempt claim refused this call before it sent anything: another
 * attempt of the same order (or this key's earlier one) is still in flight or
 * awaits reconciliation. The money question is that attempt's, not this
 * call's, so a caller recording outcomes must not write it as its own
 * pending refund. Same HTTP answer and handling as its parent.
 */
export class RefundAttemptInFlightException extends RefundPendingReconciliationException {
  readonly refundAttemptInFlight = true;
}
