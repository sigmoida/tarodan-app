import { PayoutStatus } from "@prisma/client";
import {
  isPayoutFailureReason,
  type PayoutManualSettlementMethod,
} from "@tarodan/types";
import { PAYOUT_FAILURE } from "./payout-failure-reasons";

/**
 * What an admin may do with a payout transfer that did not go through: retry
 * it (with or without a PayTR panel check first) or record it as paid
 * ("Mark as paid"). One policy for the API guards and the admin list flags,
 * so the panel never offers an action the API refuses (docs/PAYMENTS.md §6).
 */

/** The row fields the policy reads. */
export interface PayoutResolutionRow {
  status: PayoutStatus;
  failureReason: string | null;
  providerResponse: unknown;
  netAmount: unknown;
  submittedAmount: unknown;
  retryCount: number;
}

/** `providerResponse` (JSON) as an object, or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A TL amount in kuruş (the unit every payout comparison uses). */
export const toKurus = (value: unknown): number =>
  Math.round(Number(value) * 100);

/** Two TL amounts are the same to the kuruş. */
export function sameKurus(a: unknown, b: unknown): boolean {
  return toKurus(a) === toKurus(b);
}

/** Reasons the platform pays outside PayTR: PayTR provably took nothing and
 *  the payment (merchant_oid) cannot carry the net. */
const EXTERNAL_BANK_REASONS: readonly string[] = [
  PAYOUT_FAILURE.transferNeedsManualDecision,
  PAYOUT_FAILURE.transferTotalExceedsRemaining,
];

/**
 * Whether PayTR may have taken this failed transfer although we never got a
 * clear answer. Such a row is never resent or paid elsewhere before someone
 * checks the PayTR panel (the admin retry asks for that confirmation):
 * - `transfer_outcome_unknown`;
 * - a row written before the reason codes (2026-10-23) whose free-text
 *   reason came from a thrown error during a send attempt, e.g. "Bad Request
 *   Exception" for a network failure: the old failure handler counted the
 *   attempt (`retryCount > 0`) and stored PayTR's answer when there was one
 *   (`status: "error"` = a rejection). A free-text row without an attempt
 *   failed before anything was sent.
 */
export function transferOutcomeMayBeUnknown(row: PayoutResolutionRow): boolean {
  if (row.status !== PayoutStatus.failed) return false;
  if (row.failureReason === PAYOUT_FAILURE.transferOutcomeUnknown) return true;
  if (isPayoutFailureReason(row.failureReason)) return false;
  return (
    row.retryCount > 0 && asRecord(row.providerResponse)?.status !== "error"
  );
}

/** The transfer-total snapshot the processor stored when it parked or
 *  failed the row (`providerResponse.transferTotal`), as the admin sees it. */
export interface TransferTotalView {
  net: number;
  allowedTotal: number;
  ownAllowed: number;
  oidRemaining: number;
  /** Set when there was no payment or source to cap the total against. */
  missingInput: string | null;
}

export function transferTotalOf(
  providerResponse: unknown,
): TransferTotalView | null {
  const snapshot = asRecord(asRecord(providerResponse)?.transferTotal);
  if (!snapshot) return null;
  return {
    net: Number(snapshot.net ?? 0),
    allowedTotal: Number(snapshot.allowedTotal ?? 0),
    ownAllowed: Number(snapshot.ownAllowed ?? 0),
    oidRemaining: Number(snapshot.oidRemaining ?? 0),
    missingInput:
      typeof snapshot.missingInput === "string" ? snapshot.missingInput : null,
  };
}

/**
 * PayTR's own message on a transfer it rejected (`err_msg`, stored with the
 * answer in `providerResponse`), for the admin list; null when PayTR sent
 * none (accepted, unreachable, unknown outcome, parked before any call).
 */
export function providerMessageOf(providerResponse: unknown): string | null {
  const message = asRecord(providerResponse)?.err_msg;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

/**
 * The one way this row may be marked as paid, or null:
 * - `paytr_confirmed` when PayTR may have taken it (the panel shows it did);
 * - `external_bank` when PayTR provably took nothing and the payment cannot
 *   carry the net (the platform pays from its bank account). Not when the
 *   total had no payment or source to cap against: a data problem, not a
 *   residual (fix the link and retry; never pay it outside PayTR).
 * The two sets never overlap: an unknown outcome is first checked in the
 * panel, then either confirmed or retried (the processor decides again).
 */
export function manualSettlementMethodFor(
  row: PayoutResolutionRow,
): PayoutManualSettlementMethod | null {
  if (row.status !== PayoutStatus.failed) return null;
  if (transferOutcomeMayBeUnknown(row)) return "paytr_confirmed";
  if (
    row.failureReason !== null &&
    EXTERNAL_BANK_REASONS.includes(row.failureReason) &&
    !transferTotalOf(row.providerResponse)?.missingInput
  ) {
    return "external_bank";
  }
  return null;
}

/**
 * The net the seller got, per method: what the request that PayTR took
 * carried (`submittedAmount`, kept on an unknown outcome; legacy rows fall
 * back to `netAmount`), or the row's net the platform pays itself. TL.
 */
export function manualSettlementNet(
  row: PayoutResolutionRow,
  method: PayoutManualSettlementMethod,
): number {
  const source =
    method === "paytr_confirmed"
      ? (row.submittedAmount ?? row.netAmount)
      : row.netAmount;
  return toKurus(source) / 100;
}

/**
 * What the platform adds to the seller's escrow before an `external_bank`
 * payout: the part of the net the order's escrow no longer holds in the
 * ledger (a proportional refund can empty it while a residual is still
 * owed). `max(0, net - max(0, escrow))`, in kuruş.
 */
export function platformFundingAmount(net: number, escrowNet: number): number {
  return Math.max(0, toKurus(net) - Math.max(0, toKurus(escrowNet))) / 100;
}

/** What `providerResponse.manualSettlement` records on a row marked as paid. */
export interface ManualSettlementRecord {
  method: PayoutManualSettlementMethod;
  reference: string;
  adminId: string;
  settledAt: string;
  netAmount: number;
  platformFundedAmount: number;
}

/** The manual settlement stored on a row, or null when it has none. */
export function manualSettlementOf(
  providerResponse: unknown,
): ManualSettlementRecord | null {
  const record = asRecord(asRecord(providerResponse)?.manualSettlement);
  if (
    !record ||
    (record.method !== "paytr_confirmed" && record.method !== "external_bank")
  ) {
    return null;
  }
  return {
    method: record.method,
    reference: String(record.reference ?? ""),
    adminId: String(record.adminId ?? ""),
    settledAt: String(record.settledAt ?? ""),
    netAmount: Number(record.netAmount ?? 0),
    platformFundedAmount: Number(record.platformFundedAmount ?? 0),
  };
}

/**
 * `providerResponse` without an earlier manual settlement: a row sent again
 * (retry of a returned transfer) is no longer settled by it. The audit
 * record of the retry keeps the previous answer.
 */
export function withoutManualSettlement(providerResponse: unknown): unknown {
  const response = asRecord(providerResponse);
  if (!response || !("manualSettlement" in response)) return providerResponse;
  const { manualSettlement: _settled, ...rest } = response;
  return rest;
}

/** The admin list's view of what may be done with a transfer. */
export interface PayoutResolutionFlags {
  /** A retry must confirm the PayTR panel check and give a reason. */
  retryRequiresProviderCheck: boolean;
  markPaidMethod: PayoutManualSettlementMethod | null;
  /** The net the mark-paid request must confirm (`expectedNetAmount`). */
  markPaidNetAmount: number | null;
}

export function payoutResolutionFlags(
  row: PayoutResolutionRow,
): PayoutResolutionFlags {
  const method = manualSettlementMethodFor(row);
  return {
    retryRequiresProviderCheck: transferOutcomeMayBeUnknown(row),
    markPaidMethod: method,
    markPaidNetAmount: method ? manualSettlementNet(row, method) : null,
  };
}
