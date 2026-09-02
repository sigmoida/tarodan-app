import { isPdfBuffer } from "./elogo-pdf";

describe("eLogo PDF yanıt doğrulaması", () => {
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
