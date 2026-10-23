import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

/** The provider answered and refused the refund: no money moved. */
export class ProviderRefundRejectedException extends BadRequestException {
  readonly providerOutcome = "rejected" as const;

  constructor(
    response?: string | object,
    /**
     * The provider says nothing of the payment is left to refund (PayTR:
     * "kalan tutardan (0 TL) fazla olamaz"). Resending can never succeed and
     * the payment's money is gone at the provider (refunded in its panel, or
     * by an earlier attempt we did not hear back from): a person must look.
     */
    readonly nothingLeftToRefund = false,
  ) {
    super(response);
  }
}

export class ProviderRefundOutcomeUnknownException extends ServiceUnavailableException {
  readonly providerOutcome = "unknown" as const;
}

/**
 * The refund request provably never reached the provider (the connection was
 * never established: DNS, refused, connect timeout). No money moved, so the
 * same refund may be sent again: a retryable failure, not a manual review.
 * Same HTTP answer as an unreachable provider (503).
 */
export class ProviderRefundNotSentException extends ServiceUnavailableException {
  readonly providerOutcome = "not_sent" as const;

  constructor(
    response: string | object,
    /** Why it never left, with the cause code (logs and the attempt's reason). */
    readonly detail: string,
  ) {
    super(response);
  }
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
