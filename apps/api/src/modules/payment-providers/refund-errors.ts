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
