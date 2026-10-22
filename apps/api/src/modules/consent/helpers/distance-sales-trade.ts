import { ConsentAction, Prisma } from "@prisma/client";

/**
 * The trade cash payment a distance sales consent belongs to. A trade has no
 * order or cart: each party pays its own `TradeCashPayment` row (trade fee,
 * shipping and, when it applies, the cash difference), so the consent is
 * bound to that row through `consent_records.trade_cash_payment_id`. The
 * reference is also kept in `details` (rows written before the column carry
 * it only there). Written and read only through this file.
 */
export interface DistanceSalesTradeTarget {
  tradeId: string;
  tradeNumber: string;
  tradeCashPaymentId: string;
}

/**
 * The partial unique index that keeps ONE granted distance sales row per
 * trade cash payment (migration
 * `20261022160000_consent_records_trade_cash_payment`).
 */
export const TRADE_CONSENT_UNIQUE_INDEX =
  "consent_records_trade_cash_payment_granted_key";

/**
 * The `details` of a trade consent row: the reference, nothing else. Still
 * written next to the column for the readers of `details` (the previous image
 * during a deploy, ad-hoc SQL).
 */
export function distanceSalesTradeDetails(
  target: DistanceSalesTradeTarget,
): Prisma.InputJsonObject {
  return {
    tradeId: target.tradeId,
    tradeNumber: target.tradeNumber,
    tradeCashPaymentId: target.tradeCashPaymentId,
  };
}

/**
 * "Is there a consent for this trade cash payment" (the payment gate): the
 * column, or a row written before the column existed.
 */
export function distanceSalesTradeWhere(
  tradeCashPaymentId: string,
): Prisma.ConsentRecordWhereInput {
  return {
    OR: [
      { tradeCashPaymentId },
      legacyTradeConsentDetailsWhere(tradeCashPaymentId),
    ],
  };
}

/**
 * LEGACY FALLBACK: a trade consent written before
 * `consent_records.trade_cash_payment_id` existed (or by the previous image
 * during the deploy) has the column NULL and the reference only in `details`.
 * This is an unindexed JSON match. Remove it, and its use in
 * `distanceSalesTradeWhere`, once `backfill:prod:consent-trade-cash-payments`
 * has run in production after the release that writes the column
 * (`docs/OPERATIONS.md`).
 */
export function legacyTradeConsentDetailsWhere(
  tradeCashPaymentId: string,
): Prisma.ConsentRecordWhereInput {
  return {
    tradeCashPaymentId: null,
    details: { path: ["tradeCashPaymentId"], equals: tradeCashPaymentId },
  };
}

/** The target of a unique violation on that index, as a column list. */
const TRADE_CONSENT_UNIQUE_COLUMNS = new Set([
  "trade_cash_payment_id",
  "tradeCashPaymentId",
]);

/**
 * Whether a write failed on `TRADE_CONSENT_UNIQUE_INDEX`: a concurrent submit
 * for the same trade cash payment recorded the consent first. Prisma reports
 * the target of an index the schema does not describe either by its name or
 * by its column list, so both are matched; a list must be exactly that one
 * column, so a later composite unique index that includes it is not taken for
 * this one.
 */
export function isTradeConsentUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return (
      target.length === 1 && TRADE_CONSENT_UNIQUE_COLUMNS.has(String(target[0]))
    );
  }
  return String(target ?? "") === TRADE_CONSENT_UNIQUE_INDEX;
}

/** The granted distance sales row the unique index holds for a payment. */
export function recordedTradeConsentWhere(
  tradeCashPaymentId: string,
): Prisma.ConsentRecordWhereInput {
  return {
    document: "distance_sales",
    action: ConsentAction.granted,
    tradeCashPaymentId,
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

/**
 * The trade of a consent row for the admin screen: the linked cash payment's
 * trade, else (a row before the backfill, or a cash payment the test-lane
 * purge deleted) what `details` says, for a distance sales row only.
 */
export function tradeOfConsentRow(row: {
  document: string;
  details: Record<string, unknown> | null;
  tradeCashPayment: { trade: { id: string; tradeNumber: string } } | null;
}): { id: string; tradeNumber: string } | null {
  if (row.tradeCashPayment) return row.tradeCashPayment.trade;
  return row.document === "distance_sales"
    ? tradeOfConsentDetails(row.details)
    : null;
}
