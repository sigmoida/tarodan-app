/** @format */

import { parseTlAmount } from "@tarodan/shared";
import { exceedsTlNegotiatedAmountMax } from "@tarodan/types";

/**
 * The trade cash amount field. The typed text is read by the shared TL amount
 * parser (`@tarodan/shared`) and refused above the negotiated ceiling; the
 * field error comes from `negotiatedAmountError` (`@/lib/negotiatedAmount`).
 * This module adds only what is trade-specific.
 */

/**
 * The cash amount in TL, `0` when there is no amount to send: empty, zero,
 * refused text or an amount above the ceiling (the field shows why and the
 * submit is blocked). The summary, the payer choice and the cost preview read
 * it, so the preview never asks the API for an amount it refuses.
 */
export function cashAmountValue(raw: string): number {
  const parsed = parseTlAmount(raw);
  if (parsed.status !== "ok") return 0;
  return exceedsTlNegotiatedAmountMax(parsed.amount) ? 0 : parsed.amount;
}

/**
 * The signed `cashAmount` payload field: positive when I pay, negative when
 * they pay, `undefined` when there is no cash (empty, zero or refused text).
 * An amount above the ceiling throws instead of going out as "no cash": the
 * screens block it first (`negotiatedAmountError`), so this only stops a
 * caller that skipped that check.
 */
export function signedCashAmount(
  raw: string,
  payer: "me" | "them",
): number | undefined {
  const parsed = parseTlAmount(raw);
  if (parsed.status === "ok" && exceedsTlNegotiatedAmountMax(parsed.amount)) {
    throw new Error("cash amount is above the negotiated amount ceiling");
  }
  const amount = cashAmountValue(raw);
  if (amount <= 0) return undefined;
  return payer === "me" ? amount : -amount;
}
