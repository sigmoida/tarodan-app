/**
 * Typed TL amounts in admin money forms (refunds). The field is a text input
 * with `inputMode="decimal"`, never `type="number"`: a number input turns
 * "50,25" (the Turkish decimal comma) into "", and in a refund form an empty
 * amount means "refund all".
 *
 * At most two decimals, with a comma or a point. No thousands separators:
 * "1.250" has three decimals and is refused rather than read as 1.25.
 */
const TL_AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

/** The typed amount in TL; null when empty or not a valid amount. */
export function parseTlAmount(text: string): number | null {
  const v = text.trim();
  return TL_AMOUNT_PATTERN.test(v) ? Number(v.replace(",", ".")) : null;
}

/** Empty, or an amount above 0 and at most `max`. */
export function isOptionalTlAmountWithin(text: string, max: number): boolean {
  if (!text.trim()) return true;
  const n = parseTlAmount(text);
  return n !== null && n > 0 && n <= max;
}

/**
 * The amount to send: undefined when empty (the server refunds all). Text
 * that is not an amount throws instead of falling through as "all"; the
 * form's validation stops it before this runs.
 */
export function optionalTlAmountPayload(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const n = parseTlAmount(text);
  if (n === null) throw new Error("amount is not a valid TL amount");
  return n;
}
