import type { FiscalInvoice } from "@prisma/client";
import {
  buildInvoiceBillingReference,
  buildInvoiceDocumentInput,
  buildInvoiceDocumentLines,
  invoiceDocumentDescription,
  invoiceOrderNote,
} from "../invoice/fiscal-document-input";
import type { EInvoiceScenario, FiscalParty } from "../provider/e-invoice-provider";
import type {
  FiscalInvoicePdfInput,
  FiscalInvoicePdfLocale,
  FiscalInvoicePdfVerification,
} from "./fiscal-invoice-pdf.types";

/** Kayıtta olmayan, çağıranın çözdüğü girdiler (taraflar, doğrulama bağlantısı). */
export interface FiscalInvoicePdfInputOptions {
  supplier: FiscalParty;
  customer: FiscalParty;
  /** Yoksa PDF'te doğrulama bloğu basılmaz. */
  verification?: FiscalInvoicePdfVerification;
  locale?: FiscalInvoicePdfLocale;
  qrPayload?: string;
}

/**
 * Kayıtlı `FiscalInvoice`'tan görsel kopya PDF girdisi.
 *
 * Belge, sağlayıcıya giden `FiscalDocumentInput` ile AYNI kurucudan
 * (`invoice/fiscal-document-input.ts`) çıkar; kalemler kesim anındaki
 * snapshot'tan (`lineItems`), tek kalemli belgelerde matrah/oran kayıt
 * kolonlarından gelir. Tutarlar burada yeniden türetilmez: renderer satır ve
 * dip toplamları `computeFiscalDocumentTotals` ile — sağlayıcıya giden UBL'yle
 * aynı hesap — alır.
 *
 * Numara/ETTN'siz kayıt için PDF anlamsızdır; çağıran bunu önceden eler.
 */
export function buildFiscalInvoicePdfInput(
  row: FiscalInvoice,
  options: FiscalInvoicePdfInputOptions,
): FiscalInvoicePdfInput {
  if (!row.ettn) {
    throw new Error(`FiscalInvoice ${row.id} has no ETTN — cannot render a PDF`);
  }
  const issueMoment = row.issuedAt ?? row.createdAt;
  const isReturn = row.type === "return_invoice";
  const description = invoiceDocumentDescription(row.type, row.lineDescription);
  const orderNote = invoiceOrderNote(row.sourceReference);

  const document = buildInvoiceDocumentInput({
    scenario: row.documentType as EInvoiceScenario,
    isReturn,
    documentNumber: row.invoiceNumber,
    ettn: row.ettn,
    issueMoment,
    description,
    orderNote,
    supplier: options.supplier,
    customer: options.customer,
    lines: buildInvoiceDocumentLines({
      lineItems: row.lineItems,
      description,
      orderNote,
      net: Number(row.netAmount),
      vatRate: Number(row.vatRate),
    }),
    billingReference: buildInvoiceBillingReference({
      isReturn,
      billingReference: row.billingReference,
      billingReferenceIssueDate: row.billingReferenceIssueDate,
      fallbackIssueMoment: issueMoment,
    }),
  });

  return {
    document,
    provider: row.provider,
    status: row.status,
    sourceReference: row.sourceReference ?? "",
    issuedAt: row.createdAt,
    ...(options.verification ? { verification: options.verification } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.qrPayload ? { qrPayload: options.qrPayload } : {}),
  };
}
