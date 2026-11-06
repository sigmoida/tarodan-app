import {
  INSTALLMENT_FEE_RETURN_LINE_NAME,
  LINE_DESCRIPTION,
} from "./invoice-line-description";
import type { InvoiceLineItem } from "./invoice-lines";

/**
 * The buyer's installment fee (vade farkı) document, `buyer_installment_fee`
 * (ADR 0019 D4): pure amounts, no database access (the reads are in
 * `InvoiceDocumentService.resolveInstallmentFeeBasis`).
 *
 * - **One document per package** (`sourceId = orderPackage.id`), like the
 *   other buyer fee documents: its amount is the sum of the package orders'
 *   `Order.installmentFeeAmount` (the payment's fee allocated at capture),
 *   less the fee shares already given back (`RefundAttempt.installmentFeeAmount`
 *   of finalized refunds).
 * - **VAT included** (AS-F1): the buyer paid the fee as is, so the VAT is split
 *   OUT of it at the rate snapshotted on the captured charge attempt
 *   (`PaymentChargeAttempt.feeVatRatePct`). The tax is `gross - net`, never
 *   recomputed from the net: the document total must be exactly what was
 *   charged (66.38 -> 55.32 + 11.06).
 * - **Reversal pro rata to the fee refunded** (AS-F3): each refund attempt
 *   reverses its own fee share, never the goods ratio of the refund.
 */

/** TL -> kuruş; the amounts here are non-negative money values. */
const toKurus = (tl: number): number =>
  Number.isFinite(tl) ? Math.round((tl + Number.EPSILON) * 100) : 0;
const toTl = (kurus: number): number => kurus / 100;

const validRate = (vatRatePct: number): number =>
  Number.isFinite(vatRatePct) && vatRatePct > 0 ? vatRatePct : 0;

/** `gross` (VAT included) split into its net and VAT, in kuruş. */
function splitKurus(
  grossKurus: number,
  vatRatePct: number,
): { net: number; tax: number } {
  const rate = validRate(vatRatePct);
  const net =
    rate > 0 ? Math.round((grossKurus * 100) / (100 + rate)) : grossKurus;
  return { net, tax: grossKurus - net };
}

/**
 * A VAT-included amount split at `vatRatePct`: net rounded half up to the
 * kuruş, tax the rest, so `net + tax === gross` always.
 */
export function splitVatIncluded(
  gross: number,
  vatRatePct: number,
): { net: number; tax: number } {
  const { net, tax } = splitKurus(Math.max(0, toKurus(gross)), vatRatePct);
  return { net: toTl(net), tax: toTl(tax) };
}

/** One line carrying an explicit VAT, so the UBL and the record agree. */
function feeLine(
  name: string,
  netKurus: number,
  taxKurus: number,
  vatRatePct: number,
): InvoiceLineItem {
  return {
    name,
    quantity: 1,
    net: toTl(netKurus),
    unitPrice: toTl(netKurus),
    vatRate: validRate(vatRatePct),
    taxAmount: toTl(taxKurus),
  };
}

/** A package order's installment fee and what was given back of it. */
export interface InstallmentFeeOrderRow {
  id: string;
  /** F_o: `Order.installmentFeeAmount` (VAT included). */
  fee: number;
  /** Fee shares of this order's finalized refunds. */
  refundedFee: number;
}

export interface InstallmentFeeBasisInput {
  orders: readonly InstallmentFeeOrderRow[];
  /**
   * The payment's whole fee F was given back. The refund that closes the
   * PAYMENT takes the rest of F (`installmentFeeShareOf`), which can be
   * another package's shortfall: the per-order sums alone would leave that
   * package invoiced for a fee the buyer got back.
   */
  paymentFeeFullyRefunded: boolean;
  /** The charge attempt's `feeVatRatePct`. */
  vatRatePct: number;
}

export interface InstallmentFeeDocument {
  /** Σ F_o of the package before refunds, VAT included. */
  baseGross: number;
  /** What the document carries now, VAT included (0 = nothing left). */
  gross: number;
  net: number;
  tax: number;
  /** The single line, empty when nothing is left to invoice. */
  lines: InvoiceLineItem[];
}

/**
 * The package's fee document now, or null when the package never carried a
 * fee (a single payment, a 100 % platform share, installments off): no fee,
 * no document.
 */
export function buildInstallmentFeeDocument(
  input: InstallmentFeeBasisInput,
): InstallmentFeeDocument | null {
  const base = input.orders.reduce(
    (sum, order) => sum + Math.max(0, toKurus(order.fee)),
    0,
  );
  if (base <= 0) return null;
  const refunded = input.orders.reduce(
    (sum, order) => sum + Math.max(0, toKurus(order.refundedFee)),
    0,
  );
  const gross = input.paymentFeeFullyRefunded
    ? 0
    : Math.max(0, base - refunded);
  const { net, tax } = splitKurus(gross, input.vatRatePct);
  return {
    baseGross: toTl(base),
    gross: toTl(gross),
    net: toTl(net),
    tax: toTl(tax),
    lines:
      gross > 0
        ? [
            feeLine(
              LINE_DESCRIPTION.buyer_installment_fee,
              net,
              tax,
              input.vatRatePct,
            ),
          ]
        : [],
  };
}

export interface InstallmentFeeReturnInput {
  /** The document as issued (VAT-included total and its net). */
  issued: { total: number; net: number };
  /** Return invoices already issued against it (not cancelled). */
  priorReturns: readonly { total: number; net: number }[];
  /** What the document should carry now (`InstallmentFeeDocument.gross`). */
  targetGross: number;
  /**
   * This refund attempt's fee share (`RefundAttempt.installmentFeeAmount`);
   * null reverses everything outstanding (a refund event without an attempt).
   */
  refundedFee: number | null;
  /** The document's own VAT rate (`FiscalInvoice.vatRate`). */
  vatRatePct: number;
}

export interface InstallmentFeeReturn {
  total: number;
  net: number;
  tax: number;
  /** This return takes everything left of the document. */
  closesDocument: boolean;
  lines: InvoiceLineItem[];
}

/**
 * The return invoice one refund attempt owes the fee document, or null.
 *
 * Due = the attempt's fee share, but never more than the document carries
 * beyond what it should carry now (`outstanding - target`). The cap makes it
 * safe whatever the order of events: a document cut after the refund already
 * excludes its fee (nothing due), a late handler of an earlier refund still
 * reverses its own share, and a replay finds nothing left. The return that
 * closes the document takes the exact remainder of net and VAT, so the
 * returns of a fully refunded fee sum to the document to the kuruş.
 */
export function installmentFeeReturnOf(
  input: InstallmentFeeReturnInput,
): InstallmentFeeReturn | null {
  const issuedTotal = Math.max(0, toKurus(input.issued.total));
  const issuedNet = Math.max(0, toKurus(input.issued.net));
  const priorTotal = input.priorReturns.reduce(
    (sum, row) => sum + Math.max(0, toKurus(row.total)),
    0,
  );
  const priorNet = input.priorReturns.reduce(
    (sum, row) => sum + Math.max(0, toKurus(row.net)),
    0,
  );
  const outstanding = issuedTotal - priorTotal;
  if (outstanding <= 0) return null;

  const excess = Math.max(
    0,
    outstanding - Math.max(0, toKurus(input.targetGross)),
  );
  const due =
    input.refundedFee === null
      ? outstanding
      : Math.min(Math.max(0, toKurus(input.refundedFee)), excess);
  if (due <= 0) return null;

  const closesDocument = due >= outstanding;
  let net = closesDocument
    ? issuedNet - priorNet
    : splitKurus(due, input.vatRatePct).net;
  // A remainder outside [0, due] means the earlier returns were not split
  // like this one (none are today); fall back to the plain split.
  if (net < 0 || net > due) net = splitKurus(due, input.vatRatePct).net;
  const tax = due - net;
  return {
    total: toTl(due),
    net: toTl(net),
    tax: toTl(tax),
    closesDocument,
    lines: [
      feeLine(INSTALLMENT_FEE_RETURN_LINE_NAME, net, tax, input.vatRatePct),
    ],
  };
}
