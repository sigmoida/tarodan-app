/**
 * The cancel claim (lease) of an e-Arşiv, kept in `FiscalInvoice.cancelReason`
 * while a refund cancels the document: `refund_cancelling:<claimedAtMs>:<token>`.
 *
 * eLogo refuses a second cancel of the same document, and the refusal falls
 * back to a return invoice: without an exclusive claim, two handlers of one
 * refund (the post-commit fast path and the outbox drainer), or a cancel and
 * another attempt's return, both reverse the document. The token is new for
 * every handler run, so two runs of the SAME attempt never both hold it. A
 * claim older than the lease is stale: its holder died or the cancel outcome
 * stayed unknown, and the next handler settles it from the provider's status.
 */

export const INVOICE_CANCEL_CLAIM_PREFIX = "refund_cancelling";

/**
 * How long a claim stays exclusive. Well above one eLogo cancel and status
 * round trip, and short enough for the outbox retry to settle a stuck one.
 */
export const INVOICE_CANCEL_LEASE_MS = 5 * 60 * 1000;

export interface InvoiceCancelClaim {
  /** The stored value, for compare-and-set. */
  raw: string;
  claimedAt: Date;
  token: string;
}

export function formatInvoiceCancelClaim(
  token: string,
  claimedAt: Date,
): string {
  return `${INVOICE_CANCEL_CLAIM_PREFIX}:${claimedAt.getTime()}:${token}`;
}

/**
 * The claim held in `cancelReason`, or null when it holds none. A bare
 * prefix (an earlier format without a time) reads as claimed at the epoch,
 * so it is stale.
 */
export function parseInvoiceCancelClaim(
  cancelReason: string | null | undefined,
): InvoiceCancelClaim | null {
  if (!cancelReason) return null;
  if (cancelReason === INVOICE_CANCEL_CLAIM_PREFIX) {
    return { raw: cancelReason, claimedAt: new Date(0), token: "" };
  }
  const match = new RegExp(`^${INVOICE_CANCEL_CLAIM_PREFIX}:(\\d+):(.+)$`).exec(
    cancelReason,
  );
  if (!match) return null;
  return {
    raw: cancelReason,
    claimedAt: new Date(Number(match[1])),
    token: match[2],
  };
}

export function isStaleInvoiceCancelClaim(
  claim: InvoiceCancelClaim,
  now: Date = new Date(),
): boolean {
  return now.getTime() - claim.claimedAt.getTime() >= INVOICE_CANCEL_LEASE_MS;
}
