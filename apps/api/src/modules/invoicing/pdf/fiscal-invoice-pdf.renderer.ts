/**
 * Mali belge GÖRSEL KOPYA PDF'i (sağlayıcıdan bağımsız, saf render).
 *
 * eLogo PDF'i kendisi verirdi; Netsis vermez — PDF'i biz basarız. Bu dosya
 * hangi entegratörün belgeyi kestiğini bilmez: girdi `FiscalInvoicePdfInput`,
 * çıktı PDF `Buffer`'ıdır. DI, I/O ve veritabanı yoktur.
 *
 * Bağlama noktası (bu dosyada değil): `InvoiceDeliveryService.deliverPdf` —
 * `provider.fetchPdf()` `null` döndüğünde bu renderer çağrılır, çıktı aynı
 * S3/e-posta yolundan geçer. Yasal geçerlilik entegratördeki e-belgededir;
 * bu PDF yalnız alıcı/satıcının indirdiği görsel kopyadır.
 *
 * Metinler `fiscal-invoice-pdf.model.ts`te çözülür (katalog + biçim); burası
 * yalnız yerleştirir. Siyah/gri dışında renk ve görsel varlık kullanılmaz.
 */
import * as PDFDocument from "pdfkit";
import { registerPdfFonts } from "../../../common/pdf";
import {
  buildFiscalInvoicePdfModel,
  type FiscalInvoicePdfModel,
  type PdfLabelValue,
  type PdfPartyBlock,
} from "./fiscal-invoice-pdf.model";
import type { FiscalInvoicePdfInput } from "./fiscal-invoice-pdf.types";

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Alt bilgi (yasal cümle + sayfa no) için ayrılan yükseklik. */
const FOOTER_RESERVE = 70;
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - FOOTER_RESERVE;

const INK = "#000000";
const MUTED = "#555555";
const RULE = "#999999";

/** Tablo sütunları (toplam = CONTENT_WIDTH). */
const COLUMN_WIDTHS = {
  description: 165,
  quantity: 45,
  unitPrice: 75,
  discount: 60,
  vatRate: 40,
  vatAmount: 65,
  lineTotal: 65,
} as const;

type ColumnKey = keyof typeof COLUMN_WIDTHS;
const COLUMN_ORDER: ColumnKey[] = [
  "description",
  "quantity",
  "unitPrice",
  "discount",
  "vatRate",
  "vatAmount",
  "lineTotal",
];

function columnX(key: ColumnKey): number {
  let x = MARGIN;
  for (const k of COLUMN_ORDER) {
    if (k === key) return x;
    x += COLUMN_WIDTHS[k];
  }
  return x;
}

export function renderFiscalInvoicePdf(
  input: FiscalInvoicePdfInput,
): Promise<Buffer> {
  const model = buildFiscalInvoicePdfModel(input);
  return new Promise<Buffer>((resolve, reject) => {
    try {
      // bufferPages: sayfa numarası/alt bilgi toplam sayfa bilindikten sonra basılır.
      const doc = new PDFDocument({
        margin: MARGIN,
        size: "A4",
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const fonts = registerPdfFonts(doc);
      draw(doc, model, fonts);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function draw(
  doc: PDFKit.PDFDocument,
  model: FiscalInvoicePdfModel,
  fonts: { regular: string; bold: string },
): void {
  const { regular, bold } = fonts;

  // Mevcut dikey konum + taşma yönetimi: blok sığmazsa yeni sayfa.
  const ensureSpace = (height: number): void => {
    if (doc.y + height > BOTTOM_LIMIT) doc.addPage();
  };
  const rule = (): void => {
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.4);
  };

  // ── Başlık ────────────────────────────────────────────────────────────────
  doc.font(bold).fontSize(20).fillColor(INK).text(model.title, MARGIN, MARGIN, {
    width: CONTENT_WIDTH,
    align: "left",
  });
  if (model.returnMarker) {
    doc
      .font(bold)
      .fontSize(14)
      .text(model.returnMarker, MARGIN, MARGIN + 4, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
  doc.y = MARGIN + 30;
  rule();

  // ── Belge künyesi ─────────────────────────────────────────────────────────
  drawLabelValues(doc, model.meta, regular, bold, 110);
  doc.moveDown(0.6);

  // ── Taraflar ──────────────────────────────────────────────────────────────
  const partiesTop = doc.y;
  const half = (CONTENT_WIDTH - 20) / 2;
  const leftBottom = drawParty(doc, model.issuer, MARGIN, partiesTop, half, regular, bold);
  const rightBottom = drawParty(
    doc,
    model.recipient,
    MARGIN + half + 20,
    partiesTop,
    half,
    regular,
    bold,
  );
  doc.x = MARGIN;
  doc.y = Math.max(leftBottom, rightBottom) + 10;

  // ── Kalem tablosu ─────────────────────────────────────────────────────────
  const drawTableHeader = (): void => {
    const top = doc.y;
    doc.font(bold).fontSize(8).fillColor(INK);
    for (const key of COLUMN_ORDER) {
      doc.text(model.columns[key], columnX(key) + 2, top, {
        width: COLUMN_WIDTHS[key] - 4,
        align: key === "description" ? "left" : "right",
      });
    }
    doc.y = top + 14;
    rule();
  };
  drawTableHeader();

  for (const row of model.rows) {
    doc.font(regular).fontSize(8);
    const descText = row.description
      ? `${row.name}\n${row.description}`
      : row.name;
    const descHeight = doc.heightOfString(descText, {
      width: COLUMN_WIDTHS.description - 4,
    });
    const rowHeight = Math.max(descHeight, 11) + 6;
    if (doc.y + rowHeight > BOTTOM_LIMIT) {
      doc.addPage();
      drawTableHeader();
    }
    const top = doc.y;
    doc.font(regular).fillColor(INK).text(row.name, columnX("description") + 2, top, {
      width: COLUMN_WIDTHS.description - 4,
    });
    if (row.description) {
      doc.fillColor(MUTED).text(row.description, columnX("description") + 2, doc.y, {
        width: COLUMN_WIDTHS.description - 4,
      });
    }
    doc.fillColor(INK);
    for (const key of COLUMN_ORDER) {
      if (key === "description") continue;
      doc.text(row.cells[key], columnX(key) + 2, top, {
        width: COLUMN_WIDTHS[key] - 4,
        align: "right",
      });
    }
    doc.y = top + rowHeight;
  }
  rule();

  // ── Toplamlar ─────────────────────────────────────────────────────────────
  ensureSpace(model.totals.length * 14 + 10);
  const labelWidth = 210;
  const valueWidth = 90;
  const labelX = MARGIN + CONTENT_WIDTH - labelWidth - valueWidth;
  for (const line of model.totals) {
    const top = doc.y;
    doc
      .font(line.strong ? bold : regular)
      .fontSize(line.strong ? 10 : 9)
      .fillColor(INK);
    doc.text(line.label, labelX, top, { width: labelWidth - 6, align: "right" });
    doc.text(line.value, labelX + labelWidth, top, {
      width: valueWidth,
      align: "right",
    });
    doc.y = top + (line.strong ? 16 : 14);
  }
  doc.x = MARGIN;
  doc.moveDown(0.8);

  // ── İade referansı, not, sorgulama, QR verisi ─────────────────────────────
  for (const block of [model.billingReference, model.note, model.verification, model.qr]) {
    if (!block) continue;
    doc.font(regular).fontSize(8);
    const height =
      doc.heightOfString(block.text, { width: CONTENT_WIDTH }) + 24;
    ensureSpace(height);
    doc.font(bold).fontSize(9).fillColor(INK).text(block.heading, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    doc.font(regular).fontSize(8).fillColor(MUTED).text(block.text, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    doc.moveDown(0.8);
  }

  drawFooters(doc, model, regular);
}

/** "Etiket: değer" satırları; etiket sütunu sabit genişlikte. */
function drawLabelValues(
  doc: PDFKit.PDFDocument,
  items: PdfLabelValue[],
  regular: string,
  bold: string,
  labelWidth: number,
): void {
  for (const item of items) {
    const top = doc.y;
    doc.font(regular).fontSize(9).fillColor(MUTED);
    doc.text(item.label, MARGIN, top, { width: labelWidth });
    doc.font(bold).fillColor(INK);
    doc.text(item.value, MARGIN + labelWidth, top, {
      width: CONTENT_WIDTH - labelWidth,
    });
    doc.y = Math.max(doc.y, top + 12);
  }
}

/** Taraf bloğunu çizer; bloğun bittiği y'yi döner. */
function drawParty(
  doc: PDFKit.PDFDocument,
  party: PdfPartyBlock,
  x: number,
  y: number,
  width: number,
  regular: string,
  bold: string,
): number {
  doc.font(bold).fontSize(8).fillColor(MUTED).text(party.heading, x, y, { width });
  doc.font(bold).fontSize(10).fillColor(INK).text(party.name, x, doc.y + 2, { width });
  doc.font(regular).fontSize(8).fillColor(INK);
  for (const detail of party.details) {
    doc.text(`${detail.label}: ${detail.value}`, x, doc.y + 1, { width });
  }
  return doc.y;
}

/** Her sayfanın altına yasal cümle, oluşturulma anı ve "Sayfa i / n" basar. */
function drawFooters(
  doc: PDFKit.PDFDocument,
  model: FiscalInvoicePdfModel,
  regular: string,
): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Alt kenar boşluğu içine yazarken pdfkit otomatik sayfa eklemesin.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const top = PAGE_HEIGHT - MARGIN - FOOTER_RESERVE + 20;
    doc
      .moveTo(MARGIN, top - 6)
      .lineTo(MARGIN + CONTENT_WIDTH, top - 6)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    doc.font(regular).fontSize(8).fillColor(MUTED);
    doc.text(model.footer.legal, MARGIN, top, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    doc.text(model.footer.generatedAt, MARGIN, top + 22, {
      width: CONTENT_WIDTH / 2,
      align: "left",
    });
    doc.text(model.pageLabel(i + 1, range.count), MARGIN + CONTENT_WIDTH / 2, top + 22, {
      width: CONTENT_WIDTH / 2,
      align: "right",
    });
    doc.page.margins.bottom = savedBottom;
  }
}
