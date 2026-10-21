/** @format */

/**
 * The one parser for a TL amount the user types into a text field (trade cash,
 * offer and counter-offer amounts, seller discount amounts). A Turkish user
 * writes "1.000" meaning one thousand, so a dot cannot be trusted as a
 * thousands separator and grouping is refused instead of being read as a
 * decimal (`parseFloat("1.000")` is 1). The accepted shape matches what the
 * mobile amount fields (tarodan-mobile `app/trade/_lib/cash.ts`) let the user
 * type: one separator (`,` or `.`), at most two decimals. Mobile blocks other
 * keystrokes while typing; web keeps the text and refuses it visibly (letters,
 * spaces, `-`, grouping such as "1.250,50", a third decimal).
 *
 * Fields that use it are `type="text" inputMode="decimal"`: a `type="number"`
 * field hands over "1.000" as the number 1 before any parser sees the text.
 */
export type TlAmountParse =
  | { status: "empty" }
  | { status: "ok"; amount: number }
  | { status: "refused" };

const AMOUNT_SHAPE = /^\d*[.,]?\d{0,2}$/;

/** Parse the typed text. Empty, zero and separator-only text read as `empty`. */
export function parseTlAmount(raw: string): TlAmountParse {
  const text = raw.trim();
  if (text === "") return { status: "empty" };
  if (!AMOUNT_SHAPE.test(text)) return { status: "refused" };
  const [whole = "", fraction = ""] = text.split(/[.,]/);
  // Whole cents from the digits: at most two decimals, so nothing to round and
  // no binary floating-point step before the amount is fixed.
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  // Too many digits to hold exactly: refuse rather than send a wrong amount.
  if (!Number.isSafeInteger(cents)) return { status: "refused" };
  if (cents === 0) return { status: "empty" };
  return { status: "ok", amount: cents / 100 };
}

/** The amount in TL, `0` when empty or refused. */
export function tlAmountValue(raw: string): number {
  const parsed = parseTlAmount(raw);
  return parsed.status === "ok" ? parsed.amount : 0;
}

export function isTlAmountRefused(raw: string): boolean {
  return parseTlAmount(raw).status === "refused";
}

/**
 * The field text for an amount already on record (counter or edit prefill): a
 * decimal comma, as the refusal copy asks, and no grouping (same as mobile
 * `cashInputValue`). Not a positive amount: empty.
 */
export function tlAmountInputValue(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return text.replace(".", ",");
}
