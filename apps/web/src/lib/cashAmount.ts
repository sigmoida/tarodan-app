/** @format */

/**
 * The trade cash amount field. A Turkish user writes "1.000" meaning one
 * thousand, so a dot cannot be trusted as a thousands separator and grouping is
 * refused instead of being read as a decimal. The accepted shape matches what
 * the mobile field (tarodan-mobile `app/trade/_lib/cash.ts`) lets the user
 * type: one separator (`,` or `.`), at most two decimals. Mobile blocks other
 * keystrokes while typing; web keeps the text and refuses it visibly (letters,
 * spaces, `-`, grouping such as "1.250,50", a third decimal).
 */
export type CashParse =
  | { status: "empty" }
  | { status: "ok"; amount: number }
  | { status: "refused" };

const CASH_SHAPE = /^\d*[.,]?\d{0,2}$/;

/** Parse the typed text. Empty, zero and separator-only text read as `empty`. */
export function parseCashInput(raw: string): CashParse {
  const text = raw.trim();
  if (text === "") return { status: "empty" };
  if (!CASH_SHAPE.test(text)) return { status: "refused" };
  const [whole = "", fraction = ""] = text.split(/[.,]/);
  // Whole cents from the digits: at most two decimals, so nothing to round and
  // no binary floating-point step before the amount is fixed.
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  // Too many digits to hold exactly: refuse rather than drop the cash silently.
  if (!Number.isSafeInteger(cents)) return { status: "refused" };
  if (cents === 0) return { status: "empty" };
  return { status: "ok", amount: cents / 100 };
}

/** The amount in TL, `0` when empty or refused. */
export function cashAmountValue(raw: string): number {
  const parsed = parseCashInput(raw);
  return parsed.status === "ok" ? parsed.amount : 0;
}

/**
 * The signed `cashAmount` payload field: positive when I pay, negative when
 * they pay, `undefined` when there is no cash.
 */
export function signedCashAmount(
  raw: string,
  payer: "me" | "them",
): number | undefined {
  const amount = cashAmountValue(raw);
  if (amount <= 0) return undefined;
  return payer === "me" ? amount : -amount;
}

export function isCashRefused(raw: string): boolean {
  return parseCashInput(raw).status === "refused";
}

/**
 * The field text for an amount already in the offer (counter prefill): a
 * decimal comma, as the helper text asks, and no grouping (same as mobile
 * `cashInputValue`). Not a positive amount: empty.
 */
export function cashInputValue(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return text.replace(".", ",");
}
