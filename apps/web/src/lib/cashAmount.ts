/** @format */

import { tlAmountValue } from "./tlAmount";

/**
 * The trade cash amount field. The typed text is read by the shared TL amount
 * parser (`./tlAmount`); this module adds only what is trade-specific.
 *
 * The signed `cashAmount` payload field: positive when I pay, negative when
 * they pay, `undefined` when there is no cash (empty, zero or refused text).
 */
export function signedCashAmount(
  raw: string,
  payer: "me" | "them",
): number | undefined {
  const amount = tlAmountValue(raw);
  if (amount <= 0) return undefined;
  return payer === "me" ? amount : -amount;
}
