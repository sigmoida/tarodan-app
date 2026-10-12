import type {
  FiscalDocumentInput,
  FiscalDocumentLine,
} from "../provider/e-invoice-provider";
import type { FiscalInvoicePdfInput } from "./fiscal-invoice-pdf.types";

/** Başka spec'lerin yeniden kullanması için PDF girdi kurucuları. */

export const FIXTURE_SUPPLIER = {
  vknTckn: "1234567890",
  title: "Tarodan Pazaryeri A.Ş.",
  taxOffice: "Kadıköy",
  city: "İstanbul",
  district: "Kadıköy",
  streetAddress: "Örnek Mah. Şirin Sok. No:1",
  country: "Türkiye",
  email: "fatura@tarodan.com.tr",
} as const;

export const FIXTURE_CUSTOMER = {
  vknTckn: "11111111110",
  firstName: "Çağrı",
  lastName: "Öztürk",
  city: "Ankara",
  district: "Çankaya",
  streetAddress: "Gül Sok. No:5",
  country: "Türkiye",
  email: "cagri@example.com",
} as const;

/** %20 ve %10 KDV'li, iskontolu bir satır içeren tipik hizmet belgesi satırları. */
export function fixtureLines(): FiscalDocumentLine[] {
  return [
    {
      name: "Komisyon hizmet bedeli",
      description: "Sipariş No: PKG-10001",
      quantity: 1,
      unitPrice: 100,
      discount: 10,
      lineExtension: 90,
      vatRate: 20,
    },
    {
      name: "Kargo hizmeti",
      quantity: 2,
      unitPrice: 25,
      lineExtension: 50,
      vatRate: 10,
    },
  ];
}

export function buildFiscalDocumentFixture(
  overrides: Partial<FiscalDocumentInput> = {},
): FiscalDocumentInput {
  return {
    scenario: "EARCHIVE",
    kind: "SALE",
    documentNumber: "TRD2026000000001",
    ettn: "7f9c2f0e-4a1b-4c55-9d3e-2b6a8c1d0e11",
    issueDate: "2026-10-12",
    issueTime: "14:35:20",
    currency: "TRY",
    note: "Bu belge test amaçlıdır.",
    supplier: { ...FIXTURE_SUPPLIER },
    customer: { ...FIXTURE_CUSTOMER },
    lines: fixtureLines(),
    ...overrides,
  };
}

export function buildFiscalInvoicePdfInputFixture(
  overrides: Partial<FiscalInvoicePdfInput> = {},
): FiscalInvoicePdfInput {
  return {
    document: buildFiscalDocumentFixture(),
    provider: "netsis",
    status: "SENT",
    sourceReference: "KYT-10001",
    issuedAt: new Date("2026-10-12T11:35:20Z"),
    verification: {
      label: "Netsis e-Arşiv sorgulama",
      url: "https://sorgu.example.com/earsiv",
    },
    qrPayload: '{"vkn":"1234567890","no":"TRD2026000000001"}',
    ...overrides,
  };
}

/** İade belgesi: orijinale referans verir. */
export function buildReturnPdfInputFixture(): FiscalInvoicePdfInput {
  return buildFiscalInvoicePdfInputFixture({
    document: buildFiscalDocumentFixture({
      kind: "RETURN",
      documentNumber: "TRD2026000000002",
      billingReference: {
        documentNumber: "TRD2026000000001",
        issueDate: "2026-10-12",
      },
    }),
  });
}
