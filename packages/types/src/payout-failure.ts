/**
 * Why a payout transfer (`PayoutTransfer.failureReason`) is not paid: the
 * shared vocabulary of the API and the admin panel. A `failed` or
 * `retry_pending` transfer stores one of these codes, never PayTR's raw text
 * (that goes to `providerResponse`); the admin panel labels each code. Two
 * kinds of free text remain, so readers treat an unknown value as text to
 * show as is: rows written before 2026-10-23, and `returned` rows, whose
 * reason carries PayTR's reference and detection date (the status already
 * says the bank returned it).
 *
 * Seller-fixable (the seller gets the "payout failed" e-mail):
 * - no_bank_account: no bank account at transfer time.
 * - invalid_iban_format: the IBAN fails the TR format/checksum before sending.
 * - bank_details_rejected: PayTR rejected the IBAN or the account holder name.
 *
 * The team's to resolve (no seller e-mail):
 * - provider_rejected: any other PayTR rejection; not retried.
 * - transfer_total_exceeds_remaining: PayTR err_no 010 on every retry; the
 *   payment (merchant_oid) has less left than the transfer needs.
 * - transfer_needs_manual_decision: the net is larger than what the payment
 *   can still settle (e.g. a residual after a full refund); PayTR was not
 *   called. The platform pays it outside the order transfer.
 * - provider_unreachable: the request never reached PayTR (connect phase) on
 *   every retry.
 * - transfer_outcome_unknown: the request may have reached PayTR but no
 *   answer came back. Never resent automatically; check the PayTR panel.
 *
 * Guards that stop a payout before any transfer (set by the payout and refund
 * flows): order_not_payout_eligible, refund_pending, order_refunded,
 * trade_refund_pending, fully_refunded.
 */
export const PAYOUT_FAILURE_REASONS = [
  "no_bank_account",
  "invalid_iban_format",
  "bank_details_rejected",
  "provider_rejected",
  "transfer_total_exceeds_remaining",
  "transfer_needs_manual_decision",
  "provider_unreachable",
  "transfer_outcome_unknown",
  "order_not_payout_eligible",
  "refund_pending",
  "order_refunded",
  "trade_refund_pending",
  "fully_refunded",
] as const;

export type PayoutFailureReason = (typeof PAYOUT_FAILURE_REASONS)[number];

/** The reasons the seller can fix themselves (and is e-mailed about). */
export const SELLER_ACTIONABLE_PAYOUT_FAILURES = [
  "no_bank_account",
  "invalid_iban_format",
  "bank_details_rejected",
] as const satisfies readonly PayoutFailureReason[];

export function isPayoutFailureReason(
  value: unknown,
): value is PayoutFailureReason {
  return (
    typeof value === "string" &&
    (PAYOUT_FAILURE_REASONS as readonly string[]).includes(value)
  );
}
