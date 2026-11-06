import { invoiceTotalsFromLines, type InvoiceLineItem } from "./invoice-lines";

/**
 * The amounts of the RETURN invoice one refund attempt owes a sent document,
 * pure (no database).
 *
 * The rule: a return never takes more than the document carries beyond what
 * it should carry now.
 *
 *   outstanding = document total - returns already cut against it
 *   room        = outstanding - target   (target: what the document should
 *                 carry after every finalized refund, VAT included)
 *   due         = min(this attempt's share, room)
 *
 * A document is often cut AFTER an early refund, net of it (`platform_sale`
 * from `refundedOrders`, the package fee documents from the ledger's refunded
 * columns, the legacy `commission` / `service_fee` from the ledger net). The
 * refund's own event then arrives late; its share is computed on the base
 * BEFORE the refund, so without the cap that refund was reversed twice: once
 * in the cut, once in the return (QA: 240.00 cut net of a 160.00 refund, then
 * a 160.00 return). The cap makes the result independent of the order of
 * cut, refunds and handlers: a document cut net of a refund has no room for
 * it, a late handler of an earlier refund still reverses its share when the
 * document carried it, and a replay finds nothing left.
 *
 * `targetTotal` is null for a type whose amount never depends on refunds
 * (cut at the full charge at payment: membership, boost, trade): only the
 * outstanding amount bounds the return there.
 *
 * Returns null when nothing is due.
 */

/** Below one kuruş: nothing. */
const EPSILON = 0.009;

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export interface ReturnInvoiceAmountsInput {
  /** The sent document: its VAT-included total and its net. */
  issued: { total: number; net: number };
  /** Totals of the return invoices already cut against it (not cancelled). */
  priorReturnTotals: readonly number[];
  /**
   * What the document should carry now (VAT included), after every
   * finalized refund; null when its type never depends on refunds.
   */
  targetTotal: number | null;
  /**
   * This attempt's share (VAT included) when it has no component lines;
   * null reverses everything outstanding (a full refund, or a refund event
   * without an attempt).
   */
  share: number | null;
  /**
   * This attempt's refunded components as return lines. When present they
   * are the share, scaled down together when the due amount is smaller.
   */
  componentLines: readonly InvoiceLineItem[];
}

export interface ReturnInvoiceAmounts {
  total: number;
  net: number;
  /** The return's lines; empty for a single-line return. */
  lines: InvoiceLineItem[];
  /** This return takes everything left of the document. */
  closesDocument: boolean;
  /** The cap took part of the attempt's share (traced in the logs). */
  capped: boolean;
  /** The attempt's share before the cap. */
  wanted: number;
}

export function returnInvoiceAmountsOf(
  input: ReturnInvoiceAmountsInput,
): ReturnInvoiceAmounts | null {
  const returned = round2(
    input.priorReturnTotals.reduce((sum, total) => sum + Math.max(0, total), 0),
  );
  const outstanding = round2(Math.max(0, input.issued.total - returned));
  if (outstanding <= EPSILON) return null;

  const room =
    input.targetTotal === null
      ? outstanding
      : round2(Math.max(0, outstanding - Math.max(0, input.targetTotal)));
  const rawLines = input.componentLines;
  const rawTotals = rawLines.length
    ? invoiceTotalsFromLines([...rawLines])
    : null;
  const wanted = round2(
    Math.min(
      outstanding,
      rawTotals ? rawTotals.total : (input.share ?? outstanding),
    ),
  );
  const due = round2(Math.min(wanted, room));
  if (due <= EPSILON) return null;
  const capped = due < wanted - EPSILON;

  if (rawTotals) {
    const scale = rawTotals.total > due ? due / rawTotals.total : 1;
    const lines = rawLines.map((line) => ({
      ...line,
      net: round2(line.net * scale),
      unitPrice: (line.net * scale) / line.quantity,
      // VAT scales WITH the base: the line carries its own VAT
      // (`taxAmount`), so an unscaled amount would declare full VAT on a
      // reduced base and the return would exceed what is left.
      ...(typeof line.taxAmount === "number"
        ? { taxAmount: round2(line.taxAmount * scale) }
        : {}),
    }));
    const totals = invoiceTotalsFromLines(lines);
    const total = Math.min(due, totals.total);
    if (total <= EPSILON) return null;
    return {
      total,
      net: Math.min(totals.net, total),
      lines,
      closesDocument: total >= outstanding - EPSILON,
      capped,
      wanted,
    };
  }

  const netRatio =
    input.issued.total > 0 ? input.issued.net / input.issued.total : 0;
  return {
    total: due,
    net: round2(due * netRatio),
    lines: [],
    closesDocument: due >= outstanding - EPSILON,
    capped,
    wanted,
  };
}
