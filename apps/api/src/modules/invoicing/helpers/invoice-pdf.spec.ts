import { INVOICE_PDF_STORAGE, isPdfBuffer } from "./invoice-pdf";

describe("e-belge PDF yanıt doğrulaması", () => {
  it("%PDF- başlıklı veri PDF sayılır", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4 stub e-arsiv", "utf8"))).toBe(
      true,
    );
  });

  it("XML/hata metni/boş veri PDF sayılmaz — müşteriye belge diye gitmemeli", () => {
    expect(isPdfBuffer(Buffer.from('<?xml version="1.0"?><Fault/>'))).toBe(
      false,
    );
    expect(isPdfBuffer(Buffer.from("Document not found"))).toBe(false);
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
    expect(isPdfBuffer(null)).toBe(false);
  });
});

describe("e-belge PDF depolama yeri", () => {
  it("S3 klasörü ve varlık türü saklanan veriyle aynı kalır (yeniden adlandırma bir taşıma ister)", () => {
    expect(INVOICE_PDF_STORAGE).toEqual({
      folder: "elogo-invoices",
      entityType: "elogo_invoice",
    });
  });
});
