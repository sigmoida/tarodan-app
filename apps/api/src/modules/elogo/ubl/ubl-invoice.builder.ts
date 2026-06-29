/**
 * UBL-TR e-Arşiv / e-Fatura XML üreteci.
 *
 * eLogo'ya gönderilecek belgenin içeriğini üretir (UBL 2.1, TR1.2 özelleştirmesi).
 * Mali mühür / imza eLogo tarafında basılır — bu yüzden ext:UBLExtensions boş
 * bırakılır (eLogo doldurur).
 *
 * ⚠️ Yapı UBL-TR'ye göre kurgulandı; nihai şema (XSD/Schematron) doğrulaması
 * eLogo TEST ortamına gönderildiğinde yapılır. Tutar matematiği burada test edilir.
 */

export type UblProfileId = 'EARSIVFATURA' | 'TEMELFATURA' | 'TICARIFATURA';
export type UblInvoiceTypeCode = 'SATIS' | 'IADE';

export interface UblParty {
  /** 10 haneli VKN (tüzel) veya 11 haneli TCKN (gerçek kişi). */
  vknTckn: string;
  /** Tüzel kişi unvanı (şirket). Gerçek kişide boş bırakılıp firstName/lastName kullanılır. */
  title?: string;
  firstName?: string;
  lastName?: string;
  /** Vergi dairesi (VKN için). */
  taxOffice?: string;
  country?: string;
  city?: string;
  district?: string;
  streetAddress?: string;
  email?: string;
  phone?: string;
  websiteUri?: string;
}

export interface UblInvoiceLine {
  name: string;
  quantity: number;
  /** Birim kodu (UBL). Adet=C62, ay=MON. Varsayılan C62. */
  unitCode?: string;
  /** Birim fiyat (KDV hariç). */
  unitPrice: number;
  /** KDV oranı (%). Örn. 20. */
  vatRate: number;
}

export interface UblInvoiceInput {
  profileId?: UblProfileId; // e-Arşiv → EARSIVFATURA
  invoiceTypeCode?: UblInvoiceTypeCode; // SATIS / IADE
  /** Fatura numarası (16 hane, ör. TRD2026000000001). */
  id: string;
  /** ETTN (UUID). */
  uuid: string;
  /** yyyy-mm-dd */
  issueDate: string;
  /** HH:mm:ss (opsiyonel). */
  issueTime?: string;
  currency?: string; // varsayılan TRY
  supplier: UblParty; // satıcı (Tarodan / Serhatlar Ltd)
  customer: UblParty; // alıcı
  lines: UblInvoiceLine[];
  /** e-Arşiv gönderim şekli. */
  sendType?: 'ELEKTRONIK' | 'KAGIT';
  note?: string;
}

export interface UblInvoiceResult {
  xml: string;
  /** Hesaplanan toplamlar (kayıt/denetim için). */
  totals: {
    lineExtension: number;
    taxExclusive: number;
    tax: number;
    taxInclusive: number;
    payable: number;
  };
}

// ── yardımcılar ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 2 ondalığa yuvarla. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** UBL tutar formatı: 2 ondalık nokta. */
function money(n: number): string {
  return round2(n).toFixed(2);
}

function el(tag: string, value: string | number, attrs = ''): string {
  return `<${tag}${attrs ? ' ' + attrs : ''}>${typeof value === 'number' ? value : esc(String(value))}</${tag}>`;
}

function buildParty(p: UblParty, currency: string): string {
  const isTckn = (p.vknTckn || '').replace(/\D/g, '').length === 11;
  const scheme = isTckn ? 'TCKN' : 'VKN';
  const parts: string[] = [];
  if (p.websiteUri) parts.push(el('cbc:WebsiteURI', p.websiteUri));
  parts.push(`<cac:PartyIdentification>${el('cbc:ID', p.vknTckn, `schemeID="${scheme}"`)}</cac:PartyIdentification>`);
  if (p.title) parts.push(`<cac:PartyName>${el('cbc:Name', p.title)}</cac:PartyName>`);
  // PostalAddress
  const addr: string[] = [];
  if (p.streetAddress) addr.push(el('cbc:StreetName', p.streetAddress));
  if (p.district) addr.push(el('cbc:CitySubdivisionName', p.district));
  if (p.city) addr.push(el('cbc:CityName', p.city));
  addr.push(`<cac:Country>${el('cbc:Name', p.country || 'Türkiye')}</cac:Country>`);
  parts.push(`<cac:PostalAddress>${addr.join('')}</cac:PostalAddress>`);
  // Vergi dairesi (tüzel kişide)
  if (!isTckn) {
    parts.push(
      `<cac:PartyTaxScheme><cac:TaxScheme>${el('cbc:Name', p.taxOffice || '')}</cac:TaxScheme></cac:PartyTaxScheme>`,
    );
  }
  // Gerçek kişi adı
  if (isTckn && (p.firstName || p.lastName)) {
    parts.push(`<cac:Person>${el('cbc:FirstName', p.firstName || '')}${el('cbc:FamilyName', p.lastName || '')}</cac:Person>`);
  }
  // İletişim
  const contact: string[] = [];
  if (p.phone) contact.push(el('cbc:Telephone', p.phone));
  if (p.email) contact.push(el('cbc:ElectronicMail', p.email));
  if (contact.length) parts.push(`<cac:Contact>${contact.join('')}</cac:Contact>`);
  return `<cac:Party>${parts.join('')}</cac:Party>`;
}

function buildTaxSubtotal(base: number, rate: number, tax: number, currency: string): string {
  return (
    `<cac:TaxSubtotal>` +
    el('cbc:TaxableAmount', money(base), `currencyID="${currency}"`) +
    el('cbc:TaxAmount', money(tax), `currencyID="${currency}"`) +
    el('cbc:Percent', rate) +
    `<cac:TaxCategory><cac:TaxScheme>${el('cbc:Name', 'KDV')}${el('cbc:TaxTypeCode', '0015')}</cac:TaxScheme></cac:TaxCategory>` +
    `</cac:TaxSubtotal>`
  );
}

// ── ana üretici ────────────────────────────────────────────────────────────────

export function buildInvoiceXml(input: UblInvoiceInput): UblInvoiceResult {
  const currency = input.currency || 'TRY';
  const profileId = input.profileId || 'EARSIVFATURA';
  const typeCode = input.invoiceTypeCode || 'SATIS';
  if (!input.lines.length) throw new Error('UBL: en az bir fatura satırı gerekli');

  // Satır hesapları
  let lineExtensionSum = 0;
  let taxSum = 0;
  const lineXmls: string[] = [];
  input.lines.forEach((line, i) => {
    const lineExt = round2(line.quantity * line.unitPrice);
    const lineTax = round2((lineExt * line.vatRate) / 100);
    lineExtensionSum = round2(lineExtensionSum + lineExt);
    taxSum = round2(taxSum + lineTax);
    lineXmls.push(
      `<cac:InvoiceLine>` +
        el('cbc:ID', i + 1) +
        el('cbc:InvoicedQuantity', line.quantity, `unitCode="${line.unitCode || 'C62'}"`) +
        el('cbc:LineExtensionAmount', money(lineExt), `currencyID="${currency}"`) +
        `<cac:TaxTotal>${el('cbc:TaxAmount', money(lineTax), `currencyID="${currency}"`)}${buildTaxSubtotal(lineExt, line.vatRate, lineTax, currency)}</cac:TaxTotal>` +
        `<cac:Item>${el('cbc:Name', line.name)}</cac:Item>` +
        `<cac:Price>${el('cbc:PriceAmount', money(line.unitPrice), `currencyID="${currency}"`)}</cac:Price>` +
        `</cac:InvoiceLine>`,
    );
  });

  const taxExclusive = lineExtensionSum;
  const taxInclusive = round2(taxExclusive + taxSum);
  const payable = taxInclusive;

  // KDV oranlarına göre tek TaxSubtotal (basit: tüm satırlar aynı/oranlar toplanır)
  // Burada tüm satırların toplam matrahını tek oran grubunda toplamak yerine,
  // sağlamlık için tek bir özet (toplam) veriyoruz; çok oranlı senaryo ileride genişletilir.
  const taxTotalXml =
    `<cac:TaxTotal>` +
    el('cbc:TaxAmount', money(taxSum), `currencyID="${currency}"`) +
    buildTaxSubtotal(taxExclusive, input.lines[0].vatRate, taxSum, currency) +
    `</cac:TaxTotal>`;

  const ublExtensions = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>`;

  const header =
    el('cbc:UBLVersionID', '2.1') +
    el('cbc:CustomizationID', 'TR1.2') +
    el('cbc:ProfileID', profileId) +
    el('cbc:ID', input.id) +
    el('cbc:CopyIndicator', 'false') +
    el('cbc:UUID', input.uuid) +
    el('cbc:IssueDate', input.issueDate) +
    el('cbc:IssueTime', input.issueTime || '00:00:00') +
    el('cbc:InvoiceTypeCode', typeCode) +
    (input.note ? el('cbc:Note', input.note) : '') +
    el('cbc:DocumentCurrencyCode', currency) +
    el('cbc:LineCountNumeric', input.lines.length);

  // e-Arşiv gönderim şekli (opsiyonel ek referans)
  const sendTypeRef = input.sendType
    ? `<cac:AdditionalDocumentReference>${el('cbc:ID', input.sendType)}${el('cbc:IssueDate', input.issueDate)}${el('cbc:DocumentTypeCode', input.sendType)}</cac:AdditionalDocumentReference>`
    : '';

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
    `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">` +
    ublExtensions +
    header +
    sendTypeRef +
    `<cac:AccountingSupplierParty>${buildParty(input.supplier, currency)}</cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>${buildParty(input.customer, currency)}</cac:AccountingCustomerParty>` +
    taxTotalXml +
    `<cac:LegalMonetaryTotal>` +
    el('cbc:LineExtensionAmount', money(lineExtensionSum), `currencyID="${currency}"`) +
    el('cbc:TaxExclusiveAmount', money(taxExclusive), `currencyID="${currency}"`) +
    el('cbc:TaxInclusiveAmount', money(taxInclusive), `currencyID="${currency}"`) +
    el('cbc:PayableAmount', money(payable), `currencyID="${currency}"`) +
    `</cac:LegalMonetaryTotal>` +
    lineXmls.join('') +
    `</Invoice>`;

  return {
    xml,
    totals: {
      lineExtension: lineExtensionSum,
      taxExclusive,
      tax: taxSum,
      taxInclusive,
      payable,
    },
  };
}
