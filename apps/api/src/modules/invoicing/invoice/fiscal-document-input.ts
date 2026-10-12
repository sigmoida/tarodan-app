import { invoiceIssueDate, invoiceIssueTime } from "./invoice-datetime";
import { LINE_DESCRIPTION } from "./invoice-line-description";
import { readInvoiceLineItems } from "./invoice-lines";
import type {
  EInvoiceScenario,
  FiscalDocumentInput,
  FiscalDocumentLine,
  FiscalParty,
} from "../provider/e-invoice-provider";

/**
 * Kayıttan sağlayıcıya giden `FiscalDocumentInput`'un SAF kurucusu.
 *
 * Gönderim (`InvoiceDeliveryService.sendRecord`) ve görsel kopya PDF'i
 * (`buildFiscalInvoicePdfInput`) aynı belgeyi AYNI koddan kurar: sağlayıcıya
 * giden belge ile alıcıya giden PDF'in satır/tutar/not alanları ayrışamaz.
 * DI, I/O ve saat yoktur.
 */

/** Belge kaleminin açıklaması: kayıttaki snapshot, yoksa tipin varsayılanı. */
export function invoiceDocumentDescription(
  type: string,
  lineDescription: string | null | undefined,
): string {
  return lineDescription || LINE_DESCRIPTION[type] || "Hizmet bedeli";
}

/** "Kayıt No: KYT-…" notu; kaynak kod yoksa `null`. */
export function invoiceOrderNote(
  sourceReference: string | null | undefined,
): string | null {
  const reference = sourceReference?.trim();
  return reference ? `Kayıt No: ${reference}` : null;
}

/**
 * Belge satırları: kalem snapshot'ı varsa (ürün faturası) kalem kalem, yoksa
 * tek satırlı hizmet faturası. Snapshot kesim anında donduğu için retry ve
 * görsel kopya aynı belgeyi yeniden üretir.
 */
export function buildInvoiceDocumentLines(params: {
  lineItems: unknown;
  description: string;
  orderNote: string | null;
  net: number;
  vatRate: number;
}): FiscalDocumentLine[] {
  const { lineItems, description, orderNote, net, vatRate } = params;
  const snapshotLines = readInvoiceLineItems(lineItems);
  if (!snapshotLines.length) {
    return [
      {
        name: description,
        description: orderNote ?? undefined,
        quantity: 1,
        unitPrice: net,
        vatRate,
      },
    ];
  }
  return snapshotLines.map((l) => ({
    name: l.name,
    description: orderNote ?? undefined,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineExtension: l.net,
    discount: l.discount,
    vatRate: l.vatRate,
    taxAmount: l.taxAmount,
  }));
}

/** İade belgesinin orijinale referansı; iade değilse ya da referans yoksa yok. */
export function buildInvoiceBillingReference(params: {
  isReturn: boolean;
  billingReference: string | null | undefined;
  billingReferenceIssueDate: Date | null | undefined;
  fallbackIssueMoment: Date;
}): FiscalDocumentInput["billingReference"] {
  if (!params.isReturn || !params.billingReference) return undefined;
  return {
    documentNumber: params.billingReference,
    issueDate: invoiceIssueDate(
      params.billingReferenceIssueDate ?? params.fallbackIssueMoment,
    ),
  };
}

export interface InvoiceDocumentInputParams {
  scenario: EInvoiceScenario;
  isReturn: boolean;
  /** Sağlayıcı numaralandırmasında numara henüz yoktur — boş gider. */
  documentNumber: string | null | undefined;
  ettn: string;
  issueMoment: Date;
  /** Yalnız e-Arşiv'de gerekli (e-Fatura'da bu alan yok). */
  sendType?: "ELEKTRONIK" | "KAGIT";
  description: string;
  orderNote: string | null;
  supplier: FiscalParty;
  customer: FiscalParty;
  lines: FiscalDocumentLine[];
  billingReference?: FiscalDocumentInput["billingReference"];
}

export function buildInvoiceDocumentInput(
  p: InvoiceDocumentInputParams,
): FiscalDocumentInput {
  return {
    scenario: p.scenario,
    kind: p.isReturn ? "RETURN" : "SALE",
    documentNumber: p.documentNumber || undefined,
    ettn: p.ettn,
    issueDate: invoiceIssueDate(p.issueMoment),
    issueTime: invoiceIssueTime(p.issueMoment),
    currency: "TRY",
    sendType: p.sendType,
    note: p.orderNote ? `${p.description} — ${p.orderNote}` : p.description,
    supplier: p.supplier,
    customer: p.customer,
    lines: p.lines,
    ...(p.billingReference ? { billingReference: p.billingReference } : {}),
  };
}
