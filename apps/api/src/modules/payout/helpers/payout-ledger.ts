import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  type Prisma,
} from "@prisma/client";
import type { LedgerRecordInput } from "../../ledger/ledger.service";

/**
 * The payout's ledger groups: one builder per business event, so every path
 * that completes a payout writes the same entries under the same key.
 */

/** One `payout_completed` group per payout row, whatever completed it. */
export const payoutCompletedLedgerKey = (payoutId: string) =>
  `payout-completed:${payoutId}`;

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
