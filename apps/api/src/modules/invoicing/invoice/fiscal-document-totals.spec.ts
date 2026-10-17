import { computeFiscalDocumentTotals } from "./fiscal-document-totals";
import { buildInvoiceXml } from "../ubl/ubl-invoice.builder";
import type { FiscalDocumentLine } from "../provider/e-invoice-provider";

/**
 * Belge toplamlarının TEK hesap yeri. UBL üreteci belgeyi, teslim katmanı
 * kaydın tutar kolonlarını aynı sonuçtan yazar — ikisi ayrışırsa beyan edilen
 * belge ile kayıt birbirini tutmaz.
 */
describe("computeFiscalDocumentTotals", () => {
  it("tek satır: matrah × oran = KDV, ödenecek = matrah + KDV", () => {
    const { totals, lines } = computeFiscalDocumentTotals([
      { name: "Hizmet", quantity: 1, unitPrice: 100, vatRate: 20 },
    ]);
    expect(lines).toEqual([{ lineExtension: 100, tax: 20, allowance: 0 }]);
    expect(totals).toEqual({
      lineExtension: 100,
      taxExclusive: 100,
      tax: 20,
      taxInclusive: 120,
      payable: 120,
      allowance: 0,
    });
  });

  it("açık lineExtension ve taxAmount birim fiyattan yeniden türetilmez", () => {
    const { totals } = computeFiscalDocumentTotals([
      {
        name: "3 adet",
        quantity: 3,
        unitPrice: 33.333333,
        lineExtension: 100,
        vatRate: 20,
        taxAmount: 19.99,
      },
    ]);
    expect(totals.taxExclusive).toBe(100);
    expect(totals.tax).toBe(19.99);
    expect(totals.payable).toBe(119.99);
  });

  it("çok oranlı belge: oran başına matrah/KDV ayrı toplanır", () => {
    const { byRate, totals } = computeFiscalDocumentTotals([
      { name: "Ürün", quantity: 1, unitPrice: 100, vatRate: 10 },
      { name: "Kargo", quantity: 1, unitPrice: 50, vatRate: 20 },
      { name: "Hizmet", quantity: 1, unitPrice: 25, vatRate: 20 },
    ]);
    expect(byRate.get(10)).toEqual({ base: 100, tax: 10 });
    expect(byRate.get(20)).toEqual({ base: 75, tax: 15 });
    expect(totals.tax).toBe(25);
    expect(totals.payable).toBe(200);
  });

  it("iskonto matraha DAHİL edilmez, yalnız gösterilir; geçersiz iskonto 0 sayılır", () => {
    const { lines, totals } = computeFiscalDocumentTotals([
      {
        name: "İndirimli",
        quantity: 1,
        unitPrice: 120,
        lineExtension: 100,
        discount: 20,
        vatRate: 20,
      },
      {
        name: "Bozuk iskonto",
        quantity: 1,
        unitPrice: 10,
        discount: Number.NaN,
        vatRate: 20,
      },
    ]);
    expect(lines.map((l) => l.allowance)).toEqual([20, 0]);
    expect(totals.allowance).toBe(20);
    expect(totals.taxExclusive).toBe(110);
  });

  it("UBL üretecinin döndürdüğü toplamlar bu hesapla birebir aynıdır", () => {
    const lines: FiscalDocumentLine[] = [
      {
        name: "A",
        quantity: 2,
        unitPrice: 41.675,
        lineExtension: 83.35,
        discount: 1.5,
        vatRate: 20,
      },
      { name: "B", quantity: 1, unitPrice: 12.345, vatRate: 10 },
    ];
    const { totals } = buildInvoiceXml({
      id: "TRD2026000000001",
      uuid: "u",
      issueDate: "2026-10-12",
      supplier: { vknTckn: "1234567890", title: "T" },
      customer: { vknTckn: "11111111111", firstName: "A", lastName: "B" },
      lines,
    });
    expect(totals).toEqual(computeFiscalDocumentTotals(lines).totals);
  });
});
