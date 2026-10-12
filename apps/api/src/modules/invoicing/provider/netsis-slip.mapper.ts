import { FiscalInvoiceType, Prisma } from "@prisma/client";
import {
  NETSIS_DOC_TYPES,
  type NetsisArp,
  type NetsisItem,
  type NetsisItemSlip,
  type NetsisItemSlipHeader,
  type NetsisItemSlipLine,
  type NetsisSlipTotals,
} from "../../netsis";
import { computeFiscalDocumentTotals } from "../invoice/fiscal-document-totals";
import type {
  FiscalDocumentInput,
  FiscalDocumentKind,
  FiscalParty,
} from "./e-invoice-provider";
import {
  NETSIS_EDOCUMENT_KIND,
  NETSIS_HEADER_FIELDS,
  NETSIS_LINE_FIELDS,
  NETSIS_PROVIDER_REF_SEPARATOR,
  NETSIS_SERVICE_ITEM_UNIT,
  NETSIS_SLIP_TIPI,
  NETSIS_TEXT_MAX_LENGTH,
  NETSIS_TOTALS_TOLERANCE,
  NETSIS_UNIT_PRICE_DECIMALS,
} from "./netsis-invoice.constants";
import type { NetsisItemInvoiceType } from "./netsis-invoice-settings";

/**
 * Nötr belge (`FiscalDocumentInput`) → Netsis fatura fişi. SAF: ağ yok, DI
 * yok, karar yok — cari/kart/numara çağıran sağlayıcıda çözülür ve buraya
 * hazır gelir. Alan adlarının tek kaynağı `netsis-invoice.constants.ts`.
 *
 * Tutarlar Decimal ile hesaplanır ve Netsis sınırında ondalık METNE çevrilir
 * (`NetsisNumeric`): `number` ile çarpıp bölmek birim fiyatta kuruş kaydırırdı.
 */

export interface NetsisSlipMappingInput {
  document: FiscalDocumentInput;
  /** Faturanın yazılacağı cari. */
  cariCode: string;
  /**
   * Ortak perakende cari mi? Öyleyse belgenin gerçek alıcısı (ad/TCKN/adres)
   * başlığa ayrıca yazılır — cari kartı tüm bireysel alıcılarda aynıdır.
   */
  pooledCari: boolean;
  /** Bu belgenin tüm satırlarının hizmet/ürün kartı. */
  itemCode: string;
  /** Netsis'in serisinden alınan numara; `calculate` için boş bırakılır. */
  documentNumber?: string;
  /** Kayıt No (KYT-…). */
  sourceReference?: string;
}

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

function clip(text: string | undefined, max: number): string | undefined {
  const value = text?.trim();
  return value ? value.slice(0, max) : undefined;
}

/** Netsis sınırı: Decimal → ondalık metin. */
function money(value: Prisma.Decimal, decimals = 2): string {
  return value.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP).toFixed(
    decimals,
  );
}

/**
 * Belgenin hangi kartla kesileceği: türün kendisi; iade faturasında
 * ORİJİNAL belgenin türü (iade, iadesi yapılan hizmetin kartıyla kesilir).
 * Orijinal çözülemezse `null` — çağıran bunu yapılandırma reddine çevirir.
 */
export function netsisItemTypeOf(
  type: FiscalInvoiceType,
  originalType?: FiscalInvoiceType | null,
): NetsisItemInvoiceType | null {
  if (type !== FiscalInvoiceType.return_invoice) return type;
  return originalType && originalType !== FiscalInvoiceType.return_invoice
    ? originalType
    : null;
}

/** Satış → satış faturası; iade → iade faturası tipi (VERIFY, `NETSIS_DOC_TYPES`). */
export function netsisDocTypeOf(kind: FiscalDocumentKind): string {
  return kind === "RETURN"
    ? NETSIS_DOC_TYPES.salesReturnInvoice
    : NETSIS_DOC_TYPES.salesInvoice;
}

/** `providerRef` = `<FaturaTip>:<FATIRS_NO>` — fişi tekrar bulmanın anahtarı. */
export function formatNetsisProviderRef(
  docType: string,
  documentNumber: string,
): string {
  return `${docType}${NETSIS_PROVIDER_REF_SEPARATOR}${documentNumber}`;
}

export function parseNetsisProviderRef(
  ref: string | null | undefined,
): { docType: string; documentNumber: string } | null {
  const value = ref?.trim() ?? "";
  const at = value.indexOf(NETSIS_PROVIDER_REF_SEPARATOR);
  if (at <= 0 || at === value.length - 1) return null;
  return {
    docType: value.slice(0, at),
    documentNumber: value.slice(at + 1),
  };
}

function recipientOverride(customer: FiscalParty): Record<string, string> {
  const f = NETSIS_HEADER_FIELDS;
  const entries: Array<[string, string | undefined]> = [
    [f.recipientTitle, customer.title],
    [f.recipientFirstName, customer.firstName],
    [f.recipientLastName, customer.lastName],
    [f.recipientTaxId, customer.vknTckn],
    [f.recipientAddress, customer.streetAddress],
    [f.recipientCity, customer.city],
    [f.recipientDistrict, customer.district],
    [f.recipientEmail, customer.email],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => !!entry[1]?.trim()),
  );
}

function header(input: NetsisSlipMappingInput): NetsisItemSlipHeader {
  const { document } = input;
  const f = NETSIS_HEADER_FIELDS;
  const fields: NetsisItemSlipHeader = {
    CARI_KODU: input.cariCode,
    TARIH: document.issueDate,
    TIPI:
      document.kind === "RETURN" ? NETSIS_SLIP_TIPI.return : NETSIS_SLIP_TIPI.sale,
    [f.eDocumentKind]: NETSIS_EDOCUMENT_KIND[document.scenario],
    [f.ettn]: document.ettn,
    [f.ourEttnReference]: document.ettn,
  };
  if (input.documentNumber) fields.FATIRS_NO = input.documentNumber;
  const description = clip(
    document.note,
    NETSIS_TEXT_MAX_LENGTH.slipDescription,
  );
  if (description) fields.ACIKLAMA = description;
  if (document.issueTime) fields[f.issueTime] = document.issueTime;
  if (document.scenario === "EARCHIVE" && document.sendType) {
    fields[f.eArchiveSendType] = document.sendType;
  }
  const reference = input.sourceReference?.trim();
  if (reference) fields[f.sourceReference] = reference;
  if (document.kind === "RETURN" && document.billingReference) {
    fields[f.returnOfNumber] = document.billingReference.documentNumber;
    fields[f.returnOfDate] = document.billingReference.issueDate;
  }
  return input.pooledCari
    ? { ...fields, ...recipientOverride(document.customer) }
    : fields;
}

function lines(input: NetsisSlipMappingInput): NetsisItemSlipLine[] {
  const { document } = input;
  // Satır matrahı belge toplamlarının TEK hesap yerinden okunur — Netsis'e
  // giden satır ile kayda yazılan toplam aynı yuvarlamadan doğar.
  const computed = computeFiscalDocumentTotals(document.lines).lines;
  return document.lines.map((line, index): NetsisItemSlipLine => {
    const quantity = new Prisma.Decimal(line.quantity);
    const lineNet = new Prisma.Decimal(computed[index].lineExtension);
    const grossUnit = new Prisma.Decimal(line.unitPrice);
    const discount = new Prisma.Decimal(computed[index].allowance);
    const grossLine = grossUnit.mul(quantity);
    const mapped: NetsisItemSlipLine = {
      STOK_KODU: input.itemCode,
      STHAR_GCMIK: quantity.toString(),
      // Net birim fiyat (iskonto düşülmüş, KDV hariç): satır matrahı / miktar.
      STHAR_NF: money(lineNet.div(quantity), NETSIS_UNIT_PRICE_DECIMALS),
      STHAR_BF: money(grossUnit, NETSIS_UNIT_PRICE_DECIMALS),
      STHAR_KDV: new Prisma.Decimal(line.vatRate).toString(),
    };
    const description = clip(line.name, NETSIS_TEXT_MAX_LENGTH.lineDescription);
    if (description) mapped.STHAR_ACIKLAMA = description;
    if (discount.gt(ZERO) && grossLine.gt(ZERO)) {
      mapped[NETSIS_LINE_FIELDS.discountPercent] = money(
        discount.div(grossLine).mul(HUNDRED),
        4,
      );
    }
    return mapped;
  });
}

/** Belgenin Netsis fatura fişi. */
export function buildNetsisSlip(input: NetsisSlipMappingInput): NetsisItemSlip {
  return {
    FaturaTip: netsisDocTypeOf(input.document.kind),
    FatUst: header(input),
    Kalems: lines(input),
  };
}

/** Hizmet/ürün kartı — yoksa `ensureServiceItem` bununla açar. */
export function buildNetsisServiceItem(
  code: string,
  name: string,
  vatRate: number,
): NetsisItem {
  return {
    StokTemelBilgi: {
      STOK_KODU: code,
      STOK_ADI: clip(name, NETSIS_TEXT_MAX_LENGTH.itemName) ?? code,
      KDV_ORANI: vatRate,
      OLCU_BR1: NETSIS_SERVICE_ITEM_UNIT,
    },
  };
}

/** Kurumsal alıcının carisi — kod kullanıcının B/K kodudur. */
export function buildNetsisCorporateArp(
  code: string,
  party: FiscalParty,
): NetsisArp {
  const name =
    party.title?.trim() ||
    [party.firstName, party.lastName].filter(Boolean).join(" ").trim() ||
    code;
  return {
    CariTemelBilgi: {
      CARI_KOD: code,
      CARI_ISIM: name.slice(0, NETSIS_TEXT_MAX_LENGTH.cariName),
      VERGI_NUMARASI: party.vknTckn,
      ...(party.taxOffice ? { VERGI_DAIRESI: party.taxOffice } : {}),
      ...(party.streetAddress ? { CARI_ADRES: party.streetAddress } : {}),
      ...(party.city ? { CARI_IL: party.city } : {}),
      ...(party.district ? { CARI_ILCE: party.district } : {}),
      ...(party.email ? { EMAIL: party.email } : {}),
    },
  };
}

export interface NetsisExpectedTotals {
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
}

/** Kaydın beyan ettiği toplamlar — `fiscal-document-totals.ts`'ten. */
export function expectedNetsisTotals(
  document: FiscalDocumentInput,
): NetsisExpectedTotals {
  const { totals } = computeFiscalDocumentTotals(document.lines);
  return {
    netAmount: new Prisma.Decimal(totals.taxExclusive),
    vatAmount: new Prisma.Decimal(totals.tax),
    grossAmount: new Prisma.Decimal(totals.payable),
  };
}

export interface NetsisTotalsMismatch {
  field: keyof NetsisExpectedTotals;
  expected: string;
  calculated: string;
}

/**
 * Netsis'in hesapladığı (`ItemSlips/Calculate`) toplamlar ile kaydınkiler
 * arasında toleransı aşan farklar. Boş liste = belge gönderilebilir.
 *
 * Bu kontrol defteri korur: Netsis KDV'yi satır başına farklı yuvarlarsa ya da
 * iskontoyu farklı uygularsa, müşteriden tahsil edilenle GİB'e beyan edilen
 * ayrışmadan durulur.
 */
export function netsisTotalsMismatches(
  expected: NetsisExpectedTotals,
  calculated: Pick<NetsisSlipTotals, "netAmount" | "vatAmount" | "grossAmount">,
  tolerance: string | number = NETSIS_TOTALS_TOLERANCE,
): NetsisTotalsMismatch[] {
  const limit = new Prisma.Decimal(tolerance);
  return (["netAmount", "vatAmount", "grossAmount"] as const)
    .filter((field) =>
      expected[field].sub(calculated[field]).abs().gt(limit),
    )
    .map((field) => ({
      field,
      expected: money(expected[field]),
      calculated: money(calculated[field]),
    }));
}
