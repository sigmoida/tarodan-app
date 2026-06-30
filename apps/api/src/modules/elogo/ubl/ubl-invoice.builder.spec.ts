import { buildInvoiceXml, UblInvoiceInput } from './ubl-invoice.builder';

const supplier = {
  vknTckn: '1234567890',
  title: 'SERHATLAR OYUNCAK TEMİZLİK GIDA MADDELERİ İNŞAAT SAN. VE TİC. LTD. ŞTİ.',
  taxOffice: 'Pendik',
  city: 'İstanbul',
  district: 'Tuzla',
  streetAddress: 'Atatürk Cad. No:1',
  email: 'fatura@tarodan.com',
};

function baseInput(overrides: Partial<UblInvoiceInput> = {}): UblInvoiceInput {
  return {
    id: 'TRD2026000000001',
    uuid: 'ec165791-a557-476f-a956-1ca06c2b5a5b',
    issueDate: '2026-06-30',
    issueTime: '12:00:00',
    supplier,
    customer: { vknTckn: '11111111111', firstName: 'Ahmet', lastName: 'Yılmaz', city: 'İzmir' },
    lines: [{ name: 'Komisyon / hizmet bedeli', quantity: 1, unitPrice: 100, vatRate: 20 }],
    ...overrides,
  };
}

describe('buildInvoiceXml (UBL-TR)', () => {
  it('komisyon faturası: 100 TL + %20 KDV = 120 TL', () => {
    const { xml, totals } = buildInvoiceXml(baseInput());
    expect(totals.lineExtension).toBe(100);
    expect(totals.tax).toBe(20);
    expect(totals.taxInclusive).toBe(120);
    expect(totals.payable).toBe(120);
    expect(xml).toContain('<cbc:PayableAmount currencyID="TRY">120.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="TRY">100.00</cbc:TaxExclusiveAmount>');
  });

  it('yuvarlama: 3 x 33,33 @ %20 → matrah 99,99 / KDV 20,00 / ödenecek 119,99', () => {
    const { totals, xml } = buildInvoiceXml(
      baseInput({ lines: [{ name: 'Hizmet', quantity: 3, unitPrice: 33.33, vatRate: 20 }] }),
    );
    expect(totals.lineExtension).toBe(99.99);
    expect(totals.tax).toBe(20);
    expect(totals.payable).toBe(119.99);
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="TRY">99.99</cbc:LineExtensionAmount>');
  });

  it('çok satırlı: toplamlar doğru toplanır', () => {
    const { totals } = buildInvoiceXml(
      baseInput({
        lines: [
          { name: 'Komisyon', quantity: 1, unitPrice: 50, vatRate: 20 },
          { name: 'Alıcı hizmet bedeli', quantity: 1, unitPrice: 30, vatRate: 20 },
        ],
      }),
    );
    expect(totals.lineExtension).toBe(80);
    expect(totals.tax).toBe(16);
    expect(totals.payable).toBe(96);
  });

  it('zorunlu UBL-TR başlık alanları mevcut', () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>');
    expect(xml).toContain('<cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>');
    expect(xml).toContain('<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:UUID>ec165791-a557-476f-a956-1ca06c2b5a5b</cbc:UUID>');
    expect(xml).toContain('<cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<ext:UBLExtensions>'); // imza yeri (eLogo doldurur)
  });

  it('satıcı VKN, alıcı TCKN (gerçek kişi) doğru şema ile', () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain('<cbc:ID schemeID="VKN">1234567890</cbc:ID>');
    expect(xml).toContain('<cbc:ID schemeID="TCKN">11111111111</cbc:ID>');
    expect(xml).toContain('<cac:Person>');
    expect(xml).toContain('<cbc:FirstName>Ahmet</cbc:FirstName>');
  });

  it('KDV vergi şeması (0015) ve oran', () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml).toContain('<cbc:TaxTypeCode>0015</cbc:TaxTypeCode>');
    expect(xml).toContain('<cbc:Percent>20</cbc:Percent>');
  });

  it('XML iyi biçimli (kabaca: tek Invoice kökü, dengeli kapanış)', () => {
    const { xml } = buildInvoiceXml(baseInput());
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml.trim().endsWith('</Invoice>')).toBe(true);
    // basit denge kontrolü: aynı sayıda açılan/kapanan InvoiceLine
    const open = (xml.match(/<cac:InvoiceLine>/g) || []).length;
    const close = (xml.match(/<\/cac:InvoiceLine>/g) || []).length;
    expect(open).toBe(close);
    expect(open).toBe(1);
  });

  it('iade faturası: InvoiceTypeCode=IADE + orijinal fatura referansı (BillingReference)', () => {
    const { xml } = buildInvoiceXml(
      baseInput({
        invoiceTypeCode: 'IADE',
        billingReference: { invoiceId: 'TRD2026000000009', issueDate: '2026-06-01' },
      }),
    );
    expect(xml).toContain('<cbc:InvoiceTypeCode>IADE</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>TRD2026000000009</cbc:ID>');
    expect(xml).toContain('<cac:InvoiceDocumentReference>');
  });

  it('satır yoksa hata', () => {
    expect(() => buildInvoiceXml(baseInput({ lines: [] }))).toThrow();
  });
});
