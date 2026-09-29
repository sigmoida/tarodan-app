import { isInvoiceDownloadable } from "./invoice-downloadable";

/**
 * Fatura listesinin `hasPdf` alanı, panelde indirme butonunun ÇIKIP çıkmamasını
 * belirler. Anlamı "PDF S3'te duruyor mu" değil, "bu belge indirilebilir mi":
 * uç, kopyası olmayan kesilmiş bir belgeyi e-Logo'dan canlı çekip S3'e yazıyor.
 * `pdfUrl`e bağlıyken kesilmiş 38 belgede buton hiç görünmüyordu.
 */
describe("fatura indirilebilirliği", () => {
  it("S3 kopyası varsa indirilebilir", () => {
    expect(
      isInvoiceDownloadable({
        pdfUrl: "elogo/1.pdf",
        ettn: null,
        invoiceNumber: null,
      }),
    ).toBe(true);
  });

  it("kopya yok ama belge KESİLMİŞSE indirilebilir (canlı çekilir)", () => {
    expect(
      isInvoiceDownloadable({
        pdfUrl: null,
        ettn: "6723E696",
        invoiceNumber: "TRD2026000000358",
      }),
    ).toBe(true);
  });

  it("henüz kesilmemiş belge indirilemez", () => {
    expect(
      isInvoiceDownloadable({ pdfUrl: null, ettn: null, invoiceNumber: null }),
    ).toBe(false);
    // ETTN var ama numara yok: kesim tamamlanmamış.
    expect(
      isInvoiceDownloadable({
        pdfUrl: null,
        ettn: "6723E696",
        invoiceNumber: null,
      }),
    ).toBe(false);
  });
});
