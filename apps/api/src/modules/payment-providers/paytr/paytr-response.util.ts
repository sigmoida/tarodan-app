/**
 * Narrowing helpers for PayTR JSON answers, which are `unknown` until read:
 * fields may arrive as strings or numbers, in either case, or not at all.
 */

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A scalar field as trimmed text; undefined when absent or empty. */
export function textOf(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * `status` of a read-only PayTR query (BIN, installment rates). The docs
 * write "Success" in prose while the samples compare with "success", so the
 * check ignores case. Money calls (refund, status inquiry) keep their exact
 * comparison.
 */
export function isPaytrSuccess(status: unknown): boolean {
  return textOf(status)?.toLowerCase() === "success";
}

/** PayTR "y"/"n" flags (`businessCard`, `allow_non3d`); undefined otherwise. */
export function paytrYesNo(value: unknown): boolean | undefined {
  const text = textOf(value)?.toLowerCase();
  if (text === "y") return true;
  if (text === "n") return false;
  return undefined;
}
