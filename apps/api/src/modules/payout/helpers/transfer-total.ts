import { PayoutStatus, RefundAttemptStatus, type Prisma } from "@prisma/client";
import { asPaymentMetadata } from "../../payment/helpers/payment-metadata.types";
import { PAYOUT_FAILURE } from "./payout-failure-reasons";

/**
 * PayTR platform transfer `total_amount`: the slice of the payment
 * (merchant_oid) one transfer settles. PayTR rejects a transfer whose total is
 * above what the oid has left (err_no 010); refunds lower that balance, and so
 * do the other transfers on the same oid (a cart payment pays several sellers).
 * One formula, used for order and trade cash payouts, recomputed on every
 * attempt (never read back from the row):
 *
 *   ownAllowed   = source total - cash refunded on that source
 *   oidRemaining = payment amount - all refunds on the payment
 *                  - totals consumed by OTHER transfers on the same oid
 *   allowedTotal = min(ownAllowed, oidRemaining), in kurus, floored at 0
 *
 * The seller's net (`submerchant_amount`) is not changed here; when it does
 * not fit into `allowedTotal` the payout goes to a manual decision instead of
 * PayTR (the platform pays it outside the order transfer, docs/PAYMENTS.md §6).
 */

/** A transfer on the same merchant_oid, as read for the cap. */
export interface OidTransferRow {
  id: string;
  status: PayoutStatus;
  failureReason: string | null;
  amount: unknown;
  netAmount: unknown;
  submittedTotalAmount: unknown;
}

/** A refund attempt on the payment (any status; the rule filters). */
export interface RefundCashRow {
  orderId: string | null;
  tradeId: string | null;
  amount: unknown;
  status: RefundAttemptStatus;
}

export interface TransferTotalInput {
  payoutId: string;
  /** Net the seller is to receive (`submerchant_amount`), TL. */
  net: number;
  /** The order id or trade id the payout settles. */
  sourceKey: string;
  /** `Order.totalAmount` or `TradeCashPayment.totalAmount`. */
  sourceTotal: unknown;
  paymentAmount: unknown;
  /** `Payment.metadata.refundedOrders`: per-order cumulative refunds. */
  refundedOrders: Record<string, unknown> | undefined;
  refundAttempts: readonly RefundCashRow[];
  /** Every transfer on the oid; the payout itself is skipped. */
  oidTransfers: readonly OidTransferRow[];
}

/** What the decision was based on, TL; stored in `providerResponse.transferTotal`. */
export interface TransferTotalSnapshot {
  net: number;
  allowedTotal: number;
  ownAllowed: number;
  oidRemaining: number;
  sourceTotal: number;
  sourceRefunded: number;
  paymentAmount: number;
  paymentRefunded: number;
  otherTransfersTotal: number;
}

export type TransferTotalDecision =
  | { kind: "send"; totalAmount: number; snapshot: TransferTotalSnapshot }
  | { kind: "manual_decision"; snapshot: TransferTotalSnapshot };

/**
 * Refunds that took money out of the oid or may still do so. A failed attempt
 * never reached (or was refused by) PayTR; every other state holds the amount,
 * so a payout cannot use room a refund in flight needs.
 */
const CASH_HOLDING_REFUND_STATUSES: readonly RefundAttemptStatus[] = [
  RefundAttemptStatus.prepared,
  RefundAttemptStatus.submitting,
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.finalized,
  RefundAttemptStatus.manual_review,
];

/** Transfer states whose total PayTR took (or may have taken) from the oid. */
const OID_CONSUMING_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  PayoutStatus.processing,
  PayoutStatus.completed,
  // PayTR returns a bounced transfer to the merchant balance, not to the oid
  // (undocumented; asked as Q-P3), so it stays consumed.
  PayoutStatus.returned,
];

const toKurus = (value: unknown): number => Math.round(Number(value) * 100);
const toTl = (kurus: number): number => kurus / 100;

/** Total this transfer took from the oid, in kurus (0 when it took nothing). */
function consumedKurus(row: OidTransferRow): number {
  const consuming =
    OID_CONSUMING_PAYOUT_STATUSES.includes(row.status) ||
    (row.status === PayoutStatus.failed &&
      row.failureReason === PAYOUT_FAILURE.transferOutcomeUnknown);
  if (!consuming) return 0;
  if (row.submittedTotalAmount != null)
    return toKurus(row.submittedTotalAmount);
  // Rows sent before submittedTotalAmount existed sent `amount`. A zero net
  // was never sent (an adjustment consumed it; completed without PayTR).
  return toKurus(row.netAmount) > 0 ? toKurus(row.amount) : 0;
}

/**
 * Cash refunded per order/trade, in kurus. Every refund since 2026-07-28 has a
 * RefundAttempt; older ones exist only in `Payment.metadata.refundedOrders`.
 * Both are cumulative per order, so the larger one counts (never the sum).
 */
function refundedKurusByKey(
  attempts: readonly RefundCashRow[],
  refundedOrders: Record<string, unknown> | undefined,
): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const attempt of attempts) {
    if (!CASH_HOLDING_REFUND_STATUSES.includes(attempt.status)) continue;
    const key = attempt.orderId ?? attempt.tradeId ?? "payment";
    byKey.set(key, (byKey.get(key) ?? 0) + toKurus(attempt.amount));
  }
  for (const [orderId, amount] of Object.entries(refundedOrders ?? {})) {
    byKey.set(orderId, Math.max(byKey.get(orderId) ?? 0, toKurus(amount)));
  }
  return byKey;
}

export function decideTransferTotal(
  input: TransferTotalInput,
): TransferTotalDecision {
  const refunded = refundedKurusByKey(
    input.refundAttempts,
    input.refundedOrders,
  );
  const sourceRefunded = refunded.get(input.sourceKey) ?? 0;
  const paymentRefunded = [...refunded.values()].reduce((a, b) => a + b, 0);
  const otherTransfers = input.oidTransfers
    .filter((row) => row.id !== input.payoutId)
    .reduce((sum, row) => sum + consumedKurus(row), 0);

  const net = toKurus(input.net);
  const sourceTotal = toKurus(input.sourceTotal);
  const paymentAmount = toKurus(input.paymentAmount);
  const ownAllowed = Math.max(0, sourceTotal - sourceRefunded);
  const oidRemaining = Math.max(
    0,
    paymentAmount - paymentRefunded - otherTransfers,
  );
  // A missing amount makes every bound meaningless: fail closed.
  const trustworthy = [
    net,
    sourceTotal,
    paymentAmount,
    paymentRefunded,
    otherTransfers,
  ].every(Number.isFinite);
  const allowed = trustworthy ? Math.min(ownAllowed, oidRemaining) : 0;

  const snapshot: TransferTotalSnapshot = {
    net: toTl(net),
    allowedTotal: toTl(allowed),
    ownAllowed: trustworthy ? toTl(ownAllowed) : 0,
    oidRemaining: trustworthy ? toTl(oidRemaining) : 0,
    sourceTotal: toTl(sourceTotal),
    sourceRefunded: toTl(sourceRefunded),
    paymentAmount: toTl(paymentAmount),
    paymentRefunded: toTl(paymentRefunded),
    otherTransfersTotal: toTl(otherTransfers),
  };
  return trustworthy && net > 0 && net <= allowed
    ? { kind: "send", totalAmount: toTl(allowed), snapshot }
    : { kind: "manual_decision", snapshot };
}

/** The tables the loader reads (prisma or a transaction client). */
export type TransferTotalDb = Pick<
  Prisma.TransactionClient,
  "refundAttempt" | "payoutTransfer"
>;

/**
 * Reads the refunds of the payment and the transfers on the oid, then
 * decides. `payment` null (no payment behind the payout) fails closed.
 */
export async function resolveTransferTotal(
  db: TransferTotalDb,
  params: {
    payout: { id: string; merchantOid: string };
    net: number;
    source: { key: string; total: unknown } | null;
    payment: { id: string; amount: unknown; metadata: unknown } | null;
  },
): Promise<TransferTotalDecision> {
  const { payout, payment, source } = params;
  if (!payment || !source) {
    return decideTransferTotal({
      payoutId: payout.id,
      net: params.net,
      sourceKey: source?.key ?? "",
      sourceTotal: source?.total ?? Number.NaN,
      paymentAmount: Number.NaN,
      refundedOrders: undefined,
      refundAttempts: [],
      oidTransfers: [],
    });
  }
  const [refundAttempts, oidTransfers] = await Promise.all([
    db.refundAttempt.findMany({
      where: { paymentId: payment.id },
      select: { orderId: true, tradeId: true, amount: true, status: true },
    }),
    db.payoutTransfer.findMany({
      where: { merchantOid: payout.merchantOid, id: { not: payout.id } },
      select: {
        id: true,
        status: true,
        failureReason: true,
        amount: true,
        netAmount: true,
        submittedTotalAmount: true,
      },
    }),
  ]);
  return decideTransferTotal({
    payoutId: payout.id,
    net: params.net,
    sourceKey: source.key,
    sourceTotal: source.total,
    paymentAmount: payment.amount,
    refundedOrders: asPaymentMetadata(payment.metadata).refundedOrders,
    refundAttempts,
    oidTransfers,
  });
}
