import type { FiscalInvoice } from "@prisma/client";
import { computeFiscalDocumentTotals } from "../invoice/fiscal-document-totals";
import { buildFiscalInvoicePdfInput } from "./fiscal-invoice-pdf-input";
import { buildFiscalInvoicePdfModel } from "./fiscal-invoice-pdf.model";
import { FIXTURE_CUSTOMER, FIXTURE_SUPPLIER } from "./fiscal-invoice-pdf.fixture";

const OPTIONS = {
  supplier: { ...FIXTURE_SUPPLIER },
  customer: { ...FIXTURE_CUSTOMER },
};

/** Saklanan kayıt: yalnız PDF'in okuduğu kolonlar; Decimal yerine sayı (Number() ile okunur). */
function storedRow(over: Partial<Record<keyof FiscalInvoice, unknown>> = {}) {
  return {
    id: "inv-1",
    type: "commission",
    sourceReference: "KYT-10001",
    documentType: "EARCHIVE",
    invoiceNumber: "EAR2026000000001",
    ettn: "7f9c2f0e-4a1b-4c55-9d3e-2b6a8c1d0e11",
    netAmount: 100,
    taxAmount: 20,
    total: 120,
    vatRate: 20,
    status: "sent",
    provider: "netsis",
    billingReference: null,
    billingReferenceIssueDate: null,
    lineDescription: "Komisyon bedeli",
    lineItems: null,
    issuedAt: new Date("2026-10-12T11:35:20Z"),
    createdAt: new Date("2026-10-12T11:30:00Z"),
    ...over,
  } as unknown as FiscalInvoice;
}

describe("buildFiscalInvoicePdfInput", () => {
  it("satış kaydını sağlayıcıya giden belgeyle aynı alanlardan kurar", () => {
    const input = buildFiscalInvoicePdfInput(storedRow(), OPTIONS);

    expect(input.document).toEqual(
      expect.objectContaining({
        scenario: "EARCHIVE",
        kind: "SALE",
        documentNumber: "EAR2026000000001",
        ettn: "7f9c2f0e-4a1b-4c55-9d3e-2b6a8c1d0e11",
        // İstanbul takvimi: 11:35:20Z -> 14:35:20.
        issueDate: "2026-10-12",
        issueTime: "14:35:20",
        currency: "TRY",
        note: "Komisyon bedeli — Kayıt No: KYT-10001",
        supplier: OPTIONS.supplier,
        customer: OPTIONS.customer,
      }),
    );
    expect(input.document.lines).toEqual([
      {
        name: "Komisyon bedeli",
        description: "Kayıt No: KYT-10001",
        quantity: 1,
        unitPrice: 100,
        vatRate: 20,
      },
    ]);
    expect(input.document.billingReference).toBeUndefined();
    expect(input).toMatchObject({
      provider: "netsis",
      status: "sent",
      sourceReference: "KYT-10001",
      issuedAt: new Date("2026-10-12T11:30:00Z"),
    });
  });

  it("tek kalemli belgenin toplamı kaydın kolonlarıyla eşleşir", () => {
    const row = storedRow();
    const { document } = buildFiscalInvoicePdfInput(row, OPTIONS);
    const { totals } = computeFiscalDocumentTotals(document.lines);

    expect(totals.taxExclusive).toBe(Number(row.netAmount));
    expect(totals.tax).toBe(Number(row.taxAmount));
    expect(totals.payable).toBe(Number(row.total));
  });

  it("kalem snapshot'ı varsa kalem kalem basar; toplam kayıt kolonlarıyla eşleşir", () => {
    const row = storedRow({
      type: "platform_sale",
      lineDescription: null,
      netAmount: 125,
      taxAmount: 22.5,
      total: 147.5,
      lineItems: [
        { name: "Model araba", quantity: 1, net: 100, unitPrice: 100, vatRate: 20 },
        { name: "Kargo", quantity: 1, net: 25, unitPrice: 25, vatRate: 10 },
      ],
    });
    const { document } = buildFiscalInvoicePdfInput(row, OPTIONS);
    const { totals } = computeFiscalDocumentTotals(document.lines);

    expect(document.lines.map((l) => l.name)).toEqual(["Model araba", "Kargo"]);
    expect(totals.taxExclusive).toBe(Number(row.netAmount));
    expect(totals.tax).toBe(Number(row.taxAmount));
    expect(totals.payable).toBe(Number(row.total));
  });

  it("iade kaydı RETURN olur ve orijinal belgeye referans verir", () => {
    const input = buildFiscalInvoicePdfInput(
      storedRow({
        type: "return_invoice",
        billingReference: "EAR2026000000001",
        billingReferenceIssueDate: new Date("2026-10-10T21:30:00Z"),
      }),
      OPTIONS,
    );

    expect(input.document.kind).toBe("RETURN");
    // 21:30Z İstanbul'da ertesi gündür (00:30).
    expect(input.document.billingReference).toEqual({
      documentNumber: "EAR2026000000001",
      issueDate: "2026-10-11",
    });
  });

  it("referans yalnız iade belgesinde taşınır", () => {
    const input = buildFiscalInvoicePdfInput(
      storedRow({ billingReference: "EAR2026000000001" }),
      OPTIONS,
    );

    expect(input.document.billingReference).toBeUndefined();
  });

  it("e-Fatura senaryosu ve numarasız kayıt belgeye aynen geçer", () => {
    const input = buildFiscalInvoicePdfInput(
      storedRow({ documentType: "EINVOICE", invoiceNumber: null }),
      OPTIONS,
    );

    expect(input.document.scenario).toBe("EINVOICE");
    expect(input.document.documentNumber).toBeUndefined();
  });

  it("kaynak kodu yoksa not ve kalem açıklaması yalnız kalem adıdır", () => {
    const input = buildFiscalInvoicePdfInput(
      storedRow({ sourceReference: null }),
      OPTIONS,
    );

    expect(input.sourceReference).toBe("");
    expect(input.document.note).toBe("Komisyon bedeli");
    expect(input.document.lines[0].description).toBeUndefined();
  });

  it("doğrulama bağlantısı yalnız verildiğinde girdiye girer", () => {
    expect(buildFiscalInvoicePdfInput(storedRow(), OPTIONS).verification).toBe(
      undefined,
    );
    const verification = { label: "Sorgu", url: "https://sorgu.example.com" };
    expect(
      buildFiscalInvoicePdfInput(storedRow(), { ...OPTIONS, verification })
        .verification,
    ).toEqual(verification);
  });

  it("ETTN'siz kayıt için fırlatır", () => {
    expect(() =>
      buildFiscalInvoicePdfInput(storedRow({ ettn: null }), OPTIONS),
    ).toThrow(/no ETTN/);
  });

  it("modele giren durum ve tutarlar kayıttan okunur", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInput(storedRow(), OPTIONS),
    );
    const meta = Object.fromEntries(model.meta.map((m) => [m.label, m.value]));
    const totals = Object.fromEntries(model.totals.map((t) => [t.label, t.value]));

    expect(meta["Durum"]).toBe("Gönderildi");
    expect(totals["Ödenecek Tutar"]).toBe("120,00 TL");
  });
});
