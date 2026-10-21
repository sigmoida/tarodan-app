/** @format */

/**
 * The trade cash amount field. A Turkish user writes "1.000" meaning one
 * thousand, so a dot cannot be trusted as a thousands separator and grouping is
 * refused instead of being read as a decimal. Same rules as mobile: one
 * separator (`,` or `.`), at most two decimals, no grouping such as "1.250,50".
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
  const amount = Math.round(Number(text.replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { status: "empty" };
  return { status: "ok", amount };
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
