/**
 * The ceiling of an amount two users agree on: an offer, a counter-offer and
 * the cash part of a trade (create, counter and the unsaved cost preview).
 * The API refuses a larger amount (offers: `@Max` on the DTO; trade cash:
 * 400 `server.trade.invalidCashAmount` with `{max}`), and web and mobile
 * refuse it in the field before sending, with `validation.amountAboveMax`
 * (`{max}`). Mobile vendors this file into `src/types/`.
 *
 * Far below the largest `Decimal(10, 2)` column value (99,999,999.99) on
 * purpose: the payment rows add fees, shipping and commission on top
 * (`TradeCashPayment.totalAmount`, `Payment.amount`, both `Decimal(10, 2)`),
 * so an agreed amount at the column maximum would overflow later, at accept
 * or checkout.
 */
export const TL_NEGOTIATED_AMOUNT_MAX = 9_999_999;

/**
 * Whether an agreed amount is above the ceiling. Trade cash is signed (the
 * sign says who pays), so the magnitude is compared; the ceiling itself is
 * allowed.
 */
export function exceedsTlNegotiatedAmountMax(amount: number): boolean {
  return Math.abs(amount) > TL_NEGOTIATED_AMOUNT_MAX;
}
