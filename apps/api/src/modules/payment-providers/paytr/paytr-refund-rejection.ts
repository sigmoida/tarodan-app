/**
 * PayTR refund API refusal texts the money flow has to tell apart. PayTR
 * answers a refusal with HTTP 200 and `{ status: "error", err_msg }`; the
 * message is the only signal (no documented error code for refunds).
 *
 * "Nothing left": PayTR refuses because the payment's remaining refundable
 * amount is zero, e.g. "Talep edilen iade tutari (1556 TL), kalan tutardan
 * (0 TL) fazla olamaz." (Sentry TARODAN-API-3N). A non-zero remaining
 * ("kalan tutardan (15 TL)") is an ordinary refusal: a smaller amount could
 * still go through, so it stays retryable.
 */
const NOTHING_LEFT_TO_REFUND =
  /kalan\s+tutardan\s*\(\s*0+(?:[.,]0+)?\s*(?:TL)?\s*\)/i;

export function isNothingLeftToRefund(
  errMsg: string | null | undefined,
): boolean {
  return typeof errMsg === "string" && NOTHING_LEFT_TO_REFUND.test(errMsg);
}
