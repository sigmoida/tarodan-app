import {
  buildFiscalDocumentFixture,
  buildFiscalInvoicePdfInputFixture,
} from "./fiscal-invoice-pdf.fixture";
import { buildFiscalInvoicePdfModel } from "./fiscal-invoice-pdf.model";

/** "1.234,56 TL" -> 1234.56 */
function parseMoney(text: string): number {
  return Number(text.replace(/\s*TL$/, "").replace(/\./g, "").replace(",", "."));
}

describe("fiscal invoice PDF — tutar tutarlılığı", () => {
  const cases: Array<[string, ReturnType<typeof buildFiscalDocumentFixture>]> = [
    ["varsayılan fixture", buildFiscalDocumentFixture()],
    [
      "kuruş yuvarlaması olan çok adetli kalem",
      buildFiscalDocumentFixture({
        lines: [
          {
            name: "Hizmet",
            quantity: 3,
            unitPrice: 33.33,
            lineExtension: 100,
            taxAmount: 20,
            vatRate: 20,
          },
          { name: "Diğer", quantity: 1, unitPrice: 0.01, vatRate: 10 },
        ],
      }),
    ],
  ];

  it.each(cases)(
    "%s: satır matrahları toplamı ve satır KDV'leri dip toplamlarla ±0.01 eşleşir",
    (_name, document) => {
      const model = buildFiscalInvoicePdfModel(
        buildFiscalInvoicePdfInputFixture({ document }),
      );
      const lineSum = model.rows.reduce(
        (acc, r) => acc + parseMoney(r.cells.lineTotal),
        0,
      );
      const vatSum = model.rows.reduce(
        (acc, r) => acc + parseMoney(r.cells.vatAmount),
        0,
      );
      const totals = model.totals;
      const net = parseMoney(totals[0].value);
      const gross = parseMoney(totals[totals.length - 1].value);
      const vatTotal = parseMoney(totals[totals.length - 2].value);
      // Oran bazlı KDV satırları = "KDV (%x)" etiketliler.
      const perRateVat = totals
        .filter((t) => /^KDV \(%/.test(t.label))
        .reduce((acc, t) => acc + parseMoney(t.value), 0);

      expect(Math.abs(lineSum - net)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(vatSum - vatTotal)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(perRateVat - vatTotal)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(net + vatTotal - gross)).toBeLessThanOrEqual(0.01);
    },
  );
});
