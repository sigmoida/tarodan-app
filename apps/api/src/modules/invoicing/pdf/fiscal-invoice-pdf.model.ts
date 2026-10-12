import {
  trCalendarDate,
  trCalendarParts,
} from "../../../common/helpers/tr-calendar";
import { translateMessage } from "../../i18n/translate";
import { computeFiscalDocumentTotals } from "../invoice/fiscal-document-totals";
import type { FiscalParty } from "../provider/e-invoice-provider";
import type { FiscalInvoicePdfInput } from "./fiscal-invoice-pdf.types";

/**
 * PDF'in görünüm modeli: tüm etiketler katalogdan çözülmüş, tüm tutarlar
 * biçimlenmiş METİN. Çizim (pdfkit) bu modeli yalnız yerleştirir; böylece
 * "belgede ne yazıyor" sorusu PDF'i ayrıştırmadan test edilir (pdfkit gömülü
 * TTF'yi glif kimliğiyle yazar, düz metin aranamaz).
 */
export interface PdfLabelValue {
  label: string;
  value: string;
}

export interface PdfPartyBlock {
  heading: string;
  name: string;
  details: PdfLabelValue[];
}

export interface PdfLineRow {
  name: string;
  description?: string;
  cells: {
    quantity: string;
    unitPrice: string;
    discount: string;
    vatRate: string;
    vatAmount: string;
    lineTotal: string;
  };
}

export interface FiscalInvoicePdfModel {
  title: string;
  returnMarker?: string;
  meta: PdfLabelValue[];
  issuer: PdfPartyBlock;
  recipient: PdfPartyBlock;
  columns: {
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    vatRate: string;
    vatAmount: string;
    lineTotal: string;
  };
  rows: PdfLineRow[];
  totals: Array<PdfLabelValue & { strong?: boolean }>;
  billingReference?: { heading: string; text: string };
  note?: { heading: string; text: string };
  verification?: { heading: string; text: string };
  qr?: { heading: string; text: string };
  footer: { legal: string; generatedAt: string };
  /** `page`/`total` doldurulmuş "Sayfa 1 / 2" üretir (sayfa sayısı çizimde bilinir). */
  pageLabel: (page: number, total: number) => string;
}

const MONEY = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const QUANTITY = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 });

/** Tutar: tr-TR ayraçları, 2 ondalık; TRY "TL", diğer para birimleri kodla. */
export function formatFiscalMoney(amount: number, currency = "TRY"): string {
  return `${MONEY.format(amount)} ${currency === "TRY" ? "TL" : currency}`;
}

/** yyyy-mm-dd -> dd.mm.yyyy (belge tarihi zaten Türkiye takvimi; saat dilimi dönüşümü yok). */
export function formatFiscalDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

/** Bir an -> "dd.mm.yyyy HH:mm", Türkiye takvimi (belge tarihleriyle aynı biçim). */
export function formatFiscalDateTime(at: Date): string {
  const { hour, minute } = trCalendarParts(at);
  return `${formatFiscalDate(trCalendarDate(at))} ${hour}:${minute}`;
}

/** Katalogda etiketi olan kayıt durumları (`FiscalInvoiceStatus`). */
const FISCAL_STATUS_LABELS = [
  "pending",
  "processing",
  "sent",
  "signed",
  "failed",
  "cancelled",
] as const;

function partyName(party: FiscalParty): string {
  return (
    party.title?.trim() ||
    [party.firstName, party.lastName].filter(Boolean).join(" ").trim()
  );
}

export function buildFiscalInvoicePdfModel(
  input: FiscalInvoicePdfInput,
): FiscalInvoicePdfModel {
  const { document } = input;
  const locale = input.locale ?? "tr";
  const currency = document.currency ?? "TRY";
  const t = (key: string, values?: Record<string, string | number>): string =>
    translateMessage(`server.invoicing.pdf.${key}`, locale, values);
  const money = (n: number) => formatFiscalMoney(n, currency);

  const partyBlock = (party: FiscalParty, headingKey: string): PdfPartyBlock => {
    const idLabel = t(
      party.vknTckn.replace(/\D/g, "").length === 11
        ? "field.tckn"
        : "field.vkn",
    );
    const address = [
      party.streetAddress,
      party.district,
      party.city,
      party.country,
    ]
      .filter(Boolean)
      .join(", ");
    const optional: Array<[string, string | undefined]> = [
      ["field.taxOffice", party.taxOffice],
      ["field.address", address],
      ["field.email", party.email],
      ["field.phone", party.phone],
    ];
    return {
      heading: t(headingKey),
      name: partyName(party),
      details: [
        { label: idLabel, value: party.vknTckn },
        ...optional
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
          .map(([key, value]) => ({ label: t(key), value })),
      ],
    };
  };

  const computed = computeFiscalDocumentTotals(document.lines);
  const rows: PdfLineRow[] = document.lines.map((line, i) => {
    const { lineExtension, tax, allowance } = computed.lines[i];
    return {
      name: line.name,
      description: line.description,
      cells: {
        quantity: QUANTITY.format(line.quantity),
        unitPrice: money(line.unitPrice),
        discount: allowance > 0 ? money(allowance) : "-",
        vatRate: `%${line.vatRate}`,
        vatAmount: money(tax),
        lineTotal: money(lineExtension),
      },
    };
  });

  const totals: FiscalInvoicePdfModel["totals"] = [
    { label: t("totals.lineExtension"), value: money(computed.totals.lineExtension) },
  ];
  if (computed.totals.allowance > 0) {
    totals.push({
      label: t("totals.discount"),
      value: money(computed.totals.allowance),
    });
  }
  [...computed.byRate.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([rate, group]) =>
      totals.push({
        label: t("totals.vat", { rate }),
        value: money(group.tax),
      }),
    );
  totals.push(
    { label: t("totals.vatTotal"), value: money(computed.totals.tax) },
    {
      label: t("totals.gross"),
      value: money(computed.totals.payable),
      strong: true,
    },
  );

  const issueDateValue = [
    formatFiscalDate(document.issueDate),
    document.issueTime,
  ]
    .filter(Boolean)
    .join(" ");

  const meta: PdfLabelValue[] = [
    {
      label: t("field.documentNumber"),
      value: document.documentNumber || t("field.pendingNumber"),
    },
    { label: t("field.ettn"), value: document.ettn },
    { label: t("field.issueDate"), value: issueDateValue },
    { label: t("field.scenario"), value: t(`scenario.${document.scenario}`) },
    { label: t("field.reference"), value: input.sourceReference },
    {
      label: t("field.status"),
      // Bilinmeyen durum ham basılır: yanlış etiket uydurmaktan iyidir.
      value: (FISCAL_STATUS_LABELS as readonly string[]).includes(input.status)
        ? t(`status.${input.status}`)
        : input.status,
    },
  ];

  const ref = document.billingReference;
  return {
    title: t(`title.${document.scenario}`),
    returnMarker: document.kind === "RETURN" ? t("returnMarker") : undefined,
    meta,
    issuer: partyBlock(document.supplier, "section.issuer"),
    recipient: partyBlock(document.customer, "section.recipient"),
    columns: {
      description: t("column.description"),
      quantity: t("column.quantity"),
      unitPrice: t("column.unitPrice"),
      discount: t("column.discount"),
      vatRate: t("column.vatRate"),
      vatAmount: t("column.vatAmount"),
      lineTotal: t("column.lineTotal"),
    },
    rows,
    totals,
    billingReference: ref
      ? {
          heading: t("section.billingReference"),
          text: t("billingReferenceText", {
            documentNumber: ref.documentNumber,
            issueDate: formatFiscalDate(ref.issueDate),
          }),
        }
      : undefined,
    note: document.note
      ? { heading: t("section.note"), text: document.note }
      : undefined,
    verification: input.verification
      ? {
          heading: t("section.verification"),
          text: `${input.verification.label}: ${input.verification.url}`,
        }
      : undefined,
    qr: input.qrPayload
      ? { heading: t("section.qr"), text: input.qrPayload }
      : undefined,
    footer: {
      legal: t("legal"),
      generatedAt: t("generatedAt", { date: formatFiscalDateTime(input.issuedAt) }),
    },
    pageLabel: (page, total) => t("page", { page, total }),
  };
}
