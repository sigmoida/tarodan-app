import type { Prisma } from "@prisma/client";

/**
 * The trade cash payment a distance sales consent belongs to. A trade has no
 * order or cart: each party pays its own `TradeCashPayment` row (trade fee,
 * shipping and, when it applies, the cash difference), so the consent is
 * bound to that row. `ConsentRecord` has no trade column; the reference is
 * kept in `details` (see `apps/api/prisma/schema.prisma`), written and read
 * only through this file.
 */
export interface DistanceSalesTradeTarget {
  tradeId: string;
  tradeNumber: string;
  tradeCashPaymentId: string;
}

/** The `details` of a trade consent row: the reference, nothing else. */
export function distanceSalesTradeDetails(
  target: DistanceSalesTradeTarget,
): Prisma.InputJsonObject {
  return {
    tradeId: target.tradeId,
    tradeNumber: target.tradeNumber,
    tradeCashPaymentId: target.tradeCashPaymentId,
  };
}

/** "Is there a consent for this trade cash payment" (the payment gate). */
export function distanceSalesTradeWhere(
  tradeCashPaymentId: string,
): Prisma.ConsentRecordWhereInput {
  return {
    details: { path: ["tradeCashPaymentId"], equals: tradeCashPaymentId },
  };
}

/**
 * The trade a consent row refers to, read back from its `details` (already
 * narrowed to a plain object by the caller).
 */
export function tradeOfConsentDetails(
  details: Record<string, unknown> | null,
): { id: string; tradeNumber: string } | null {
  if (!details) return null;
  const { tradeId, tradeNumber } = details;
  if (typeof tradeId !== "string" || typeof tradeNumber !== "string") {
    return null;
  }
  return { id: tradeId, tradeNumber };
}
