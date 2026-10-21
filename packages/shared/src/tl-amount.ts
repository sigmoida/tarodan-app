/**
 * The one parser for a TL amount typed into a text field, for web, admin and
 * the shared listing form (mobile vendors this file: tarodan-mobile
 * `app/trade/_lib/cash.ts`).
 *
 * A Turkish user writes "1.000" meaning one thousand, so a dot cannot be
 * trusted as a thousands separator and grouping is refused instead of being
 * read as a decimal (`parseFloat("1.000")` is 1). The accepted shape: digits
 * with at most one separator (`,` or `.`) and at most two decimals. Letters,
 * spaces, signs, exponents, grouping such as "1.250,50" and a third decimal
 * are refused, and the caller shows `validation.amountFormatRefused`.
 *
 * The amount comes from the digit strings as whole cents, so there is no
 * binary floating-point step before it is fixed ("0.57" stays 0.57).
 *
 * Fields that use it are `type="text" inputMode="decimal"`: a `type="number"`
 * field hands over "1.000" as the number 1 before any parser sees the text.
 */
export type TlAmountParse =
  | { status: "empty" }
  | { status: "ok"; amount: number }
  | { status: "refused" };

/** What a context accepts. Leave a rule out to get the default. */
export interface TlAmountRules {
  /**
   * How a zero amount ("0", "0,00") reads.
   * - `"empty"` (default): no amount, as if the field were blank (trade cash,
   *   offers, optional discount bounds).
   * - `"amount"`: a real 0 (a free tier price, a 0 lower bound).
   * - `"refused"`: never a valid amount, so it cannot alias an empty field
   *   (a refund, where empty means "refund all").
   */
  zero?: "empty" | "amount" | "refused";
  /**
   * Accept a separator with digits on one side only ("12," and ",5").
   * Default true; a lone separator (",") then reads like zero.
   */
  bareSeparator?: boolean;
}

/**
 * The strict rules for an optional amount whose empty value has a meaning (a
 * refund: empty refunds all). Zero and a bare separator are refused, so
 * nothing but blank text reads as empty.
 */
export const STRICT_TL_AMOUNT: Readonly<TlAmountRules> = Object.freeze({
  zero: "refused",
  bareSeparator: false,
});

/** Rules for a field where 0 is a real value (prices, fees, lower bounds). */
export const ZERO_TL_AMOUNT: Readonly<TlAmountRules> = Object.freeze({
  zero: "amount",
});

const SHAPE = /^\d*[.,]?\d{0,2}$/;
const STRICT_SHAPE = /^\d+([.,]\d{1,2})?$/;

/** Parse the typed text. Blank text is always `empty`. */
export function parseTlAmount(
  raw: string,
  rules: TlAmountRules = {},
): TlAmountParse {
  const text = raw.trim();
  if (text === "") return { status: "empty" };
  const shape = rules.bareSeparator === false ? STRICT_SHAPE : SHAPE;
  if (!shape.test(text)) return { status: "refused" };
  const [whole = "", fraction = ""] = text.split(/[.,]/);
  // Whole cents from the digits: at most two decimals, so nothing to round.
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  // Too many digits to hold exactly: refuse rather than send a wrong amount.
  if (!Number.isSafeInteger(cents)) return { status: "refused" };
  if (cents === 0) {
    const zero = rules.zero ?? "empty";
    if (zero === "amount") return { status: "ok", amount: 0 };
    return { status: zero };
  }
  return { status: "ok", amount: cents / 100 };
}

/** The amount in TL, `0` when empty or refused. */
export function tlAmountValue(raw: string, rules?: TlAmountRules): number {
  const parsed = parseTlAmount(raw, rules);
  return parsed.status === "ok" ? parsed.amount : 0;
}

export function isTlAmountRefused(raw: string, rules?: TlAmountRules): boolean {
  return parseTlAmount(raw, rules).status === "refused";
}

/**
 * The field text for an amount already on record (edit or counter prefill): a
 * decimal comma, as the refusal copy asks, and no grouping. A negative or
 * non-finite amount is empty, and so is 0 unless `rules.zero` is `"amount"`.
 */
export function tlAmountInputValue(
  amount: number,
  rules: TlAmountRules = {},
): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  if (amount === 0 && rules.zero !== "amount") return "";
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return text.replace(".", ",");
}

/**
 * An optional amount whose empty value has a meaning (a refund: empty refunds
 * all): blank, or an amount above 0 and at most `max`, read with
 * {@link STRICT_TL_AMOUNT}.
 */
export function isOptionalTlAmountWithin(raw: string, max: number): boolean {
  const parsed = parseTlAmount(raw, STRICT_TL_AMOUNT);
  if (parsed.status === "empty") return true;
  return parsed.status === "ok" && parsed.amount > 0 && parsed.amount <= max;
}

/**
 * The amount to send for such a field: undefined only for blank text (the
 * server refunds all). Text that is not an amount throws instead of falling
 * through as "all"; the form's validation stops it before this runs.
 */
export function optionalTlAmountPayload(raw: string): number | undefined {
  const parsed = parseTlAmount(raw, STRICT_TL_AMOUNT);
  if (parsed.status === "empty") return undefined;
  if (parsed.status === "refused") {
    throw new Error("amount is not a valid TL amount");
  }
  return parsed.amount;
}
