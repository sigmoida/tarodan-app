import { buildInvoiceXml, UblInvoiceInput } from "./ubl-invoice.builder";

const supplier = {
  vknTckn: "1234567890",
  title:
    "SERHATLAR OYUNCAK TEMİZLİK GIDA MADDELERİ İNŞAAT SAN. VE TİC. LTD. ŞTİ.",
  taxOffice: "Pendik",
  city: "İstanbul",
  district: "Tuzla",
  streetAddress: "Atatürk Cad. No:1",
  email: "fatura@tarodan.com",
};

function baseInput(overrides: Partial<UblInvoiceInput> = {}): UblInvoiceInput {
  return {
    id: "TRD2026000000001",
    uuid: "ec165791-a557-476f-a956-1ca06c2b5a5b",
    issueDate: "2026-06-30",
    issueTime: "12:00:00",
    supplier,
    customer: {
      vknTckn: "11111111111",
      firstName: "Ahmet",
      lastName: "Yılmaz",
      city: "İzmir",
    },
    lines: [
      {
        name: "Komisyon / hizmet bedeli",
        quantity: 1,
        unitPrice: 100,
        vatRate: 20,
      },
    ],
    ...overrides,
  };
}

describe("buildInvoiceXml (UBL-TR)", () => {
  it("komisyon faturası: 100 TL + %20 KDV = 120 TL", () => {
    const { xml, totals } = buildInvoiceXml(baseInput());
    expect(totals.lineExtension).toBe(100);
    expect(totals.tax).toBe(20);
    expect(totals.taxInclusive).toBe(120);
    expect(totals.payable).toBe(120);
    expect(xml).toContain(
      '<cbc:PayableAmount currencyID="TRY">120.00</cbc:PayableAmount>',
    );
    expect(xml).toContain(
      '<cbc:TaxExclusiveAmount currencyID="TRY">100.00</cbc:TaxExclusiveAmount>',
    );
  });

  it('e-Arşiv gönderim şekli: cbc:ID="gonderimSekli" + DocumentType=ELEKTRONIK (canlı doğrulandı)', () => {
    // eLogo marker'ı ID="gonderimSekli"; değer DocumentType'ta. ID'ye ELEKTRONIK yazılırsa
    // eLogo "Faturanın gönderim şekli belirtilmelidir" hatası verir.
    const { xml } = buildInvoiceXml(baseInput({ sendType: "ELEKTRONIK" }));
    expect(xml).toContain(
      "<cac:AdditionalDocumentReference><cbc:ID>gonderimSekli</cbc:ID>",
    );
    expect(xml).toContain("<cbc:DocumentType>ELEKTRONIK</cbc:DocumentType>");
  });

  it("UBL Party sırası: Contact (e-posta), Person'dan ÖNCE gelir", () => {
    const { xml } = buildInvoiceXml(
      baseInput({
        customer: {
          vknTckn: "11111111111",
          firstName: "Ahmet",
          lastName: "Yılmaz",
          email: "a@b.com",
        },
      }),
    );
    expect(xml.indexOf("<cac:Contact>")).toBeLessThan(
      xml.indexOf("<cac:Person>"),
    );
  });

  it("yuvarlama: 3 x 33,33 @ %20 → matrah 99,99 / KDV 20,00 / ödenecek 119,99", () => {
    const { totals, xml } = buildInvoiceXml(
      baseInput({
        lines: [{ name: "Hizmet", quantity: 3, unitPrice: 33.33, vatRate: 20 }],
      }),
    );
    expect(totals.lineExtension).toBe(99.99);
    expect(totals.tax).toBe(20);
    expect(totals.payable).toBe(119.99);
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="TRY">99.99</cbc:LineExtensionAmount>',
    );
  });

  it("çok satırlı: toplamlar doğru toplanır", () => {
    const { totals } = buildInvoiceXml(
      baseInput({
        lines: [
          { name: "Komisyon", quantity: 1, unitPrice: 50, vatRate: 20 },
          {
            name: "Alıcı hizmet bedeli",
            quantity: 1,
            unitPrice: 30,
            vatRate: 20,
          },
        ],
      }),
    );
    expect(totals.lineExtension).toBe(80);
    expect(totals.tax).toBe(16);
    expect(totals.payable).toBe(96);
  });

  it("zorunlu UBL-TR başlık alanları mevcut", () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain("<cbc:UBLVersionID>2.1</cbc:UBLVersionID>");
    expect(xml).toContain("<cbc:CustomizationID>TR1.2</cbc:CustomizationID>");
    expect(xml).toContain("<cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>");
    expect(xml).toContain(
      "<cbc:UUID>ec165791-a557-476f-a956-1ca06c2b5a5b</cbc:UUID>",
    );
    expect(xml).toContain(
      "<cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>",
    );
    expect(xml).toContain("<ext:UBLExtensions>"); // imza yeri (eLogo doldurur)
  });

  it("satıcı VKN, alıcı TCKN (gerçek kişi) doğru şema ile", () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain('<cbc:ID schemeID="VKN">1234567890</cbc:ID>');
    expect(xml).toContain('<cbc:ID schemeID="TCKN">11111111111</cbc:ID>');
    expect(xml).toContain("<cac:Person>");
    expect(xml).toContain("<cbc:FirstName>Ahmet</cbc:FirstName>");
  });

  it("KDV vergi şeması (0015) ve oran", () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain("<cbc:TaxTypeCode>0015</cbc:TaxTypeCode>");
    expect(xml).toContain("<cbc:Percent>20</cbc:Percent>");
  });

  it("XML iyi biçimli (kabaca: tek Invoice kökü, dengeli kapanış)", () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml.trim().endsWith("</Invoice>")).toBe(true);
    // basit denge kontrolü: aynı sayıda açılan/kapanan InvoiceLine
    const open = (xml.match(/<cac:InvoiceLine>/g) || []).length;
    const close = (xml.match(/<\/cac:InvoiceLine>/g) || []).length;
    expect(open).toBe(close);
    expect(open).toBe(1);
  });

  it("iade faturası: InvoiceTypeCode=IADE + orijinal fatura referansı (BillingReference)", () => {
    const { xml } = buildInvoiceXml(
      baseInput({
        invoiceTypeCode: "IADE",
        billingReference: {
          invoiceId: "TRD2026000000009",
          issueDate: "2026-06-01",
        },
      }),
    );
    expect(xml).toContain("<cbc:InvoiceTypeCode>IADE</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cac:BillingReference>");
    expect(xml).toContain("<cbc:ID>TRD2026000000009</cbc:ID>");
    expect(xml).toContain("<cac:InvoiceDocumentReference>");
  });

  it("satır yoksa hata", () => {
    expect(() => buildInvoiceXml(baseInput({ lines: [] }))).toThrow();
  });
});

/**
 * Ürün faturası (platform satışı) tek kalem olamaz: alıcının gördüğü belgede
 * ürünün ADI, ADEDİ, kargo ve hizmet bedeli ayrı satırlarda durmalı. Ürün KDV'si
 * kategoriye göre %1/%10 olabilirken kargo/hizmet bedeli hizmet oranındadır —
 * yani belge ÇOK ORANLIDIR ve TaxTotal oran başına gruplanmak zorundadır.
 */
describe("buildInvoiceXml — çok kalemli / çok oranlı belge", () => {
  const multiRate = () =>
    baseInput({
      lines: [
        { name: "Çocuk Kitabı", quantity: 3, unitPrice: 50, vatRate: 10 },
        { name: "Kargo bedeli", quantity: 1, unitPrice: 40, vatRate: 20 },
        { name: "Hizmet bedeli", quantity: 1, unitPrice: 10, vatRate: 20 },
      ],
    });

  it("her kalem kendi satırı olarak yazılır", () => {
    const { xml } = buildInvoiceXml(multiRate());
    expect(xml).toContain("<cbc:Name>Çocuk Kitabı</cbc:Name>");
    expect(xml).toContain("<cbc:Name>Kargo bedeli</cbc:Name>");
    expect(xml).toContain("<cbc:Name>Hizmet bedeli</cbc:Name>");
    expect(xml).toContain("<cbc:LineCountNumeric>3</cbc:LineCountNumeric>");
    expect(xml).toContain(
      '<cbc:InvoicedQuantity unitCode="C62">3</cbc:InvoicedQuantity>',
    );
  });

  it("toplamlar oranları karıştırmadan hesaplanır", () => {
    const { totals } = buildInvoiceXml(multiRate());
    // 150 @ %10 = 15 KDV; 50 @ %20 = 10 KDV.
    expect(totals.taxExclusive).toBe(200);
    expect(totals.tax).toBe(25);
    expect(totals.payable).toBe(225);
  });

  it("TaxTotal her KDV oranı için ayrı TaxSubtotal taşır", () => {
    const { xml } = buildInvoiceXml(multiRate());
    const header = xml.slice(
      xml.indexOf("<cac:LegalMonetaryTotal>") - 2000,
      xml.indexOf("<cac:LegalMonetaryTotal>"),
    );
    // %10 grubu: matrah 150 / KDV 15 — %20 grubu: matrah 50 / KDV 10.
    expect(header).toContain(
      '<cbc:TaxableAmount currencyID="TRY">150.00</cbc:TaxableAmount>',
    );
    expect(header).toContain(
      '<cbc:TaxableAmount currencyID="TRY">50.00</cbc:TaxableAmount>',
    );
    expect(header).toContain("<cbc:Percent>10</cbc:Percent>");
    expect(header).toContain("<cbc:Percent>20</cbc:Percent>");
  });

  it("tek oranlı belgede tek TaxSubtotal kalır (davranış değişmez)", () => {
    const { xml } = buildInvoiceXml(baseInput());
    const header = xml.slice(0, xml.indexOf("<cac:LegalMonetaryTotal>"));
    const subtotals = header.match(/<cac:TaxSubtotal>/g) ?? [];
    expect(subtotals).toHaveLength(1);
  });

  it("satır toplamı verildiğinde birim fiyat yuvarlaması matrahı kaydırmaz", () => {
    // 100,00 matrah / 3 adet → birim 33,3333. Satır toplamı AÇIKÇA verilir ki
    // tahsil edilen tutar ile faturalanan tutar kuruşu kuruşuna eşleşsin.
    const { totals, xml } = buildInvoiceXml(
      baseInput({
        lines: [
          {
            name: "Ürün",
            quantity: 3,
            unitPrice: 100 / 3,
            lineExtension: 100,
            vatRate: 20,
          },
        ],
      }),
    );
    expect(totals.lineExtension).toBe(100);
    expect(totals.payable).toBe(120);
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="TRY">100.00</cbc:LineExtensionAmount>',
    );
    expect(xml).toContain(
      '<cbc:PriceAmount currencyID="TRY">33.3333</cbc:PriceAmount>',
    );
  });
});
