import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  type Prisma,
} from "@prisma/client";
import type { LedgerRecordInput } from "../../ledger/ledger.service";

/**
 * The payout's ledger groups. One builder per business event, shared by the
 * automatic completion (PayTR accepted or confirmed) and the admin's manual
 * settlement, so both write the same entries under the same keys.
 */

/** One `payout_completed` group per payout row, whatever completed it. */
export const payoutCompletedLedgerKey = (payoutId: string) =>
  `payout-completed:${payoutId}`;

/** One platform-funding group per payout row (external_bank settlement). */
export const payoutPlatformFundingLedgerKey = (payoutId: string) =>
  `payout-platform-funding:${payoutId}`;

/** What the payout's ledger rows point at (escrow is checked per order). */
export interface PayoutLedgerRefs {
  payoutId: string;
  sellerId: string;
  orderId: string | null;
  holdId: string | null;
  /** Trade cash payouts: the trade whose escrow the payout settles. */
  tradeId?: string | null;
}

const refsOf = (refs: PayoutLedgerRefs): LedgerRecordInput["refs"] => ({
  payoutId: refs.payoutId,
  sellerId: refs.sellerId,
  orderId: refs.orderId,
  holdId: refs.holdId,
  ...(refs.tradeId ? { tradeId: refs.tradeId } : {}),
});

/**
 * Escrow -> paid to the seller: `seller_escrow` credit (the debt held since
 * capture closes) and `payout` debit (money out), both `net`.
 */
export function payoutCompletedLedgerInput(
  refs: PayoutLedgerRefs,
  net: number,
  metadata?: Prisma.InputJsonValue,
): LedgerRecordInput {
  return {
    eventType: LedgerEventType.payout_completed,
    idempotencyKey: payoutCompletedLedgerKey(refs.payoutId),
    entries: [
      {
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.credit,
        amount: net,
      },
      {
        account: LedgerAccount.payout,
        direction: LedgerDirection.debit,
        amount: net,
      },
    ],
    refs: refsOf(refs),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/**
 * The platform puts its own money into the seller's escrow before paying a
 * net the order's escrow no longer holds (residual after a proportional
 * refund): `seller_escrow` debit (like a capture) and `platform_commission`
 * credit (platform revenue goes down), both `amount`. The reverse of the
 * seller-fault residual settlement (`hold-residual-settle:<holdId>`).
 */
export function platformFundingLedgerInput(
  refs: PayoutLedgerRefs,
  amount: number,
  metadata: Prisma.InputJsonValue,
): LedgerRecordInput {
  const memo = `Platform-funded payout ${refs.payoutId} (order ${refs.orderId ?? "-"}, trade ${refs.tradeId ?? "-"})`;
  return {
    eventType: LedgerEventType.adjustment,
    idempotencyKey: payoutPlatformFundingLedgerKey(refs.payoutId),
    entries: [
      {
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.debit,
        amount,
        memo,
      },
      {
        account: LedgerAccount.platform_commission,
        direction: LedgerDirection.credit,
        amount,
        memo,
      },
    ],
    refs: refsOf(refs),
    metadata,
  };
}
