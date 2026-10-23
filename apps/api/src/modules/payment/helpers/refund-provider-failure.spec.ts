import { RefundAttemptStatus } from "@prisma/client";
import {
  ProviderRefundNotSentException,
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
} from "../../payment-providers/refund-errors";
import { i18nMessage } from "../../i18n";
import {
  REFUND_FAILURE_PROVIDER_NOTHING_LEFT,
  REFUND_FAILURE_PROVIDER_NOT_SENT,
  isPaymentNotYetSyncedRejection,
  providerRefundFailure,
  refundAttemptFailureData,
} from "./refund-provider-failure";

/**
 * What a failed PayTR refund call leaves on the attempt. One table for the
 * order refund and the trade cash refund (both used to copy the branch).
 * Only "the money may have moved" goes to manual review; a definite "no"
 * stays retryable, except when PayTR says nothing of the payment is left:
 * resending the same amount can never succeed, a person has to look.
 */
describe("providerRefundFailure", () => {
  const NOTHING_LEFT =
    "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.";

  it("a request that never left the host is a retryable failure, not manual review", () => {
    const failure = providerRefundFailure(
      new ProviderRefundNotSentException(
        i18nMessage("server.payment.refundInitiationFailed"),
        "fetch failed (UND_ERR_CONNECT_TIMEOUT)",
      ),
    );

    expect(failure).toEqual({
      status: RefundAttemptStatus.failed,
      failureReason: `${REFUND_FAILURE_PROVIDER_NOT_SENT}: fetch failed (UND_ERR_CONNECT_TIMEOUT)`,
      needsReconciliation: false,
    });
  });

  it("PayTR's 'nothing left to refund' goes to manual review with a marker", () => {
    const failure = providerRefundFailure(
      new ProviderRefundRejectedException(NOTHING_LEFT, true),
    );

    expect(failure).toEqual({
      status: RefundAttemptStatus.manual_review,
      failureReason: `${REFUND_FAILURE_PROVIDER_NOTHING_LEFT}: ${NOTHING_LEFT}`,
      needsReconciliation: true,
    });
  });

  it("any other PayTR rejection stays a retryable failure with PayTR's text (pin)", () => {
    expect(
      providerRefundFailure(
        new ProviderRefundRejectedException("iade limiti asildi"),
      ),
    ).toEqual({
      status: RefundAttemptStatus.failed,
      failureReason: "iade limiti asildi",
      needsReconciliation: false,
    });
  });

  it("an unknown outcome stays manual review (pin)", () => {
    const failure = providerRefundFailure(
      new ProviderRefundOutcomeUnknownException(
        i18nMessage("server.payment.refundError"),
      ),
    );

    expect(failure.status).toBe(RefundAttemptStatus.manual_review);
    expect(failure.needsReconciliation).toBe(true);
    // The catalog key, not Nest's "Service Unavailable Exception".
    expect(failure.failureReason).toContain("server.payment.refundError");
  });

  it("an unexpected error is treated as an unknown outcome (pin)", () => {
    expect(providerRefundFailure(new Error("socket hang up"))).toEqual({
      status: RefundAttemptStatus.manual_review,
      failureReason: "socket hang up",
      needsReconciliation: true,
    });
  });
});

describe("isPaymentNotYetSyncedRejection", () => {
  it.each([
    "Odeme henuz siteye bildirilmemis",
    "odeme henuz siteye bildirilmemis, daha sonra deneyin",
    "henuz siteye bildirilmemi",
  ])("recognises %s", (text) => {
    expect(isPaymentNotYetSyncedRejection(text)).toBe(true);
  });

  it("does not match other rejections", () => {
    expect(isPaymentNotYetSyncedRejection("iade limiti asildi")).toBe(false);
  });
});

describe("refundAttemptFailureData", () => {
  it("a retryable failure counts towards the sweep backoff", () => {
    expect(
      refundAttemptFailureData({
        status: RefundAttemptStatus.failed,
        failureReason: "iade limiti asildi",
        needsReconciliation: false,
      }),
    ).toEqual({
      status: RefundAttemptStatus.failed,
      failureReason: "iade limiti asildi",
      failureCount: { increment: 1 },
    });
  });

  it("a parked attempt does not count (it is not resent by the sweep)", () => {
    expect(
      refundAttemptFailureData({
        status: RefundAttemptStatus.manual_review,
        failureReason: "provider_nothing_left: ...",
        needsReconciliation: true,
      }),
    ).toEqual({
      status: RefundAttemptStatus.manual_review,
      failureReason: "provider_nothing_left: ...",
    });
  });
});
