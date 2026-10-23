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
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reasons the platform pays outside PayTR: PayTR provably took nothing and
 *  the payment (merchant_oid) cannot carry the net. */
const EXTERNAL_BANK_REASONS: readonly string[] = [
  PAYOUT_FAILURE.transferNeedsManualDecision,
  PAYOUT_FAILURE.transferTotalExceedsRemaining,
];

/**
 * Whether PayTR may have taken this failed transfer although we never got a
 * clear answer: `transfer_outcome_unknown`, or a row written before the
 * reason codes (2026-10-23) whose free-text reason came from a thrown error
 * rather than a PayTR answer (`status: "error"` in `providerResponse`), e.g.
 * "Bad Request Exception" for a network failure. Such a row is never resent
 * or paid elsewhere before someone checks the PayTR panel.
 */
export function transferOutcomeMayBeUnknown(row: PayoutResolutionRow): boolean {
  if (row.status !== PayoutStatus.failed) return false;
  if (row.failureReason === PAYOUT_FAILURE.transferOutcomeUnknown) return true;
  if (isPayoutFailureReason(row.failureReason)) return false;
  const answer = row.providerResponse;
  return !(isRecord(answer) && answer.status === "error");
}

/** The admin must confirm the PayTR panel check (and give a reason) before
 *  retrying: a resend of a transfer PayTR already took pays twice. */
export function retryRequiresProviderCheck(row: PayoutResolutionRow): boolean {
  return transferOutcomeMayBeUnknown(row);
}

/**
 * Set when the payout had no payment or source to cap the transfer total
 * against (`providerResponse.transferTotal.missingInput`): a data problem,
 * not a residual. Fix the link and retry; never pay it outside PayTR.
 */
export function transferTotalMissingInput(
  providerResponse: unknown,
): string | null {
  if (!isRecord(providerResponse)) return null;
  const snapshot = providerResponse.transferTotal;
  if (!isRecord(snapshot)) return null;
  return typeof snapshot.missingInput === "string"
    ? snapshot.missingInput
    : null;
}

/**
 * The one way this row may be marked as paid, or null:
 * - `paytr_confirmed` when PayTR may have taken it (the panel shows it did);
 * - `external_bank` when PayTR provably took nothing and the payment cannot
 *   carry the net (the platform pays from its bank account).
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
    transferTotalMissingInput(row.providerResponse) === null
  ) {
    return "external_bank";
  }
  return null;
}

const toKurus = (value: unknown): number => Math.round(Number(value) * 100);

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

/** Two TL amounts are the same to the kuruş. */
export function sameKurus(a: unknown, b: unknown): boolean {
  return toKurus(a) === toKurus(b);
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
  if (!isRecord(providerResponse)) return null;
  const record = providerResponse.manualSettlement;
  if (!isRecord(record)) return null;
  if (
    record.method !== "paytr_confirmed" &&
    record.method !== "external_bank"
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

/** The admin list's view of what may be done with a transfer. */
export interface PayoutResolutionFlags {
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
    retryRequiresProviderCheck: retryRequiresProviderCheck(row),
    markPaidMethod: method,
    markPaidNetAmount: method ? manualSettlementNet(row, method) : null,
  };
}
