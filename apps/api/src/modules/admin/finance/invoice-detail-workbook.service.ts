import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import type {
  InvoiceDetailData,
  InvoiceDetailLine,
  InvoiceSourceRow,
} from "./invoice-detail.service";

/**
 * Tek faturanın DETAY DÖKÜMÜ (Excel).
 *
 * Üç sayfa, üç soru: "Bu belge nedir?" (künye), "Neyi faturalıyor?" (kalemler),
 * "Hangi işlemden doğdu?" (kaynak). Dosya mali müşavire tek başına gider —
 * ekrana dönüp bakılamayacağı için kısaltma kullanılmaz, tür ve durum açık
 * Türkçe yazılır.
 */

const MONEY = '#,##0.00" ₺"';
const DATE = "dd.mm.yyyy hh:mm";

/**
 * Belge etiketleri BURADA yaşar. Admin arayüzü aynı türleri kendi
 * kataloğundan çevirir; bu dosya ise ekranın değil MUHASEBENİN çıktısıdır ve
 * her zaman Türkçedir — hakediş dökümüyle aynı ilke.
 */
const TYPE_LABELS: Record<string, string> = {
  commission: "Komisyon (birleşik)",
  service_fee: "Hizmet bedeli (birleşik)",
  buyer_commission: "Alıcı komisyonu",
  buyer_service_fee: "Alıcı koruma hizmet bedeli",
  buyer_shipping: "Kargo bedeli (alıcı payı)",
  seller_commission: "Satıcı komisyonu",
  seller_platform_fee: "Platform hizmet bedeli",
  seller_shipping: "Kargo bedeli (satıcı payı)",
  membership: "Üyelik",
  boost: "Öne çıkarma",
  trade_commission: "Takas komisyonu",
  trade_service_fee: "Takas hizmet bedeli",
  trade_shipping: "Takas kargo bedeli",
  platform_sale: "Platform satışı",
  penalty: "Ceza faturası",
  return_invoice: "İade faturası",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Beklemede",
  processing: "Gönderiliyor",
  sent: "Faturalandı",
  signed: "Faturalandı (imzalı)",
  failed: "Hata",
  cancelled: "Fatura iptal edildi",
};

const CONTEXT_LABELS: Record<string, string> = {
  direct_sale: "Doğrudan satış",
  offer: "Teklif",
  trade: "Takas",
  platform_service: "Platform hizmeti",
};

@Injectable()
export class InvoiceDetailWorkbookService {
  filename(invoiceNumber: string): string {
    return `fatura-detay-${invoiceNumber || "belge"}.xlsx`;
  }

  async build(detail: InvoiceDetailData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tarodan";
    workbook.company = "Tarodan";
    workbook.title = `Fatura Detayı — ${detail.invoiceNumber}`;

    this.addSummarySheet(workbook, detail);
    this.addLinesSheet(workbook, detail.lines);
    this.addSourceSheet(workbook, detail.source);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Künye: belgeyi tanımlayan her şey tek sayfada, alan → değer. */
  private addSummarySheet(
    workbook: ExcelJS.Workbook,
    detail: InvoiceDetailData,
  ): void {
    const sheet = workbook.addWorksheet("Fatura");
    sheet.columns = [
      { header: "Alan", key: "label", width: 28 },
      { header: "Değer", key: "value", width: 56 },
    ];
    sheet.getRow(1).font = { bold: true };

    const rows: Array<[string, string | number | Date | null]> = [
      ["Fatura No", detail.invoiceNumber],
      [
        "Belge Tipi",
        detail.documentType === "EINVOICE" ? "e-Fatura" : "e-Arşiv",
      ],
      ["Fatura Türü", TYPE_LABELS[detail.type] ?? detail.type],
      ["Açıklama", detail.description],
      ["Durum", STATUS_LABELS[detail.status] ?? detail.status],
      [
        "Sipariş Gerçekleşme Şekli",
        detail.context
          ? (CONTEXT_LABELS[detail.context] ?? detail.context)
          : "—",
      ],
      ["Kayıt No", detail.sourceReference ?? "—"],
      ["ETTN", detail.ettn ?? "—"],
      ["Düzenlenme Tarihi", detail.issuedAt ?? detail.createdAt],
      ["Oluşturulma Tarihi", detail.createdAt],
      ["Satıcı", detail.sellerName ?? "—"],
      ["Satıcı Kodu", detail.sellerCode ?? "—"],
      ["Alıcı", detail.buyerName ?? "—"],
      ["Alıcı Kodu", detail.buyerCode ?? "—"],
      ["Fatura Muhatabı", detail.recipientName ?? "—"],
      ["Muhatap VKN/TCKN", detail.recipientVknTckn ?? "—"],
      ["Muhatap E-posta", detail.recipientEmail ?? "—"],
      ["Matrah (KDV hariç)", detail.netAmount],
      ["İskonto", detail.discountTotal],
      ["KDV Oranı (%)", detail.vatRate],
      ["KDV", detail.taxAmount],
      ["KDV DAHİL TUTAR", detail.total],
    ];
    if (detail.billingReference)
      rows.push(["İade Edilen Fatura", detail.billingReference]);
    if (detail.cancelledAt) rows.push(["İptal Tarihi", detail.cancelledAt]);
    if (detail.cancelReason) rows.push(["İptal Nedeni", detail.cancelReason]);

    for (const [label, value] of rows) {
      const row = sheet.addRow({ label, value });
      const cell = row.getCell("value");
      if (value instanceof Date) cell.numFmt = DATE;
      else if (typeof value === "number" && !label.includes("Oran"))
        cell.numFmt = MONEY;
      if (label === "KDV DAHİL TUTAR") row.font = { bold: true };
    }
  }

  /** Belgenin kalemleri — hizmet faturasında tek satırdır, boş bırakılmaz. */
  private addLinesSheet(
    workbook: ExcelJS.Workbook,
    lines: InvoiceDetailLine[],
  ): void {
    const sheet = workbook.addWorksheet("Kalemler");
    sheet.columns = [
      { header: "Kalem", key: "name", width: 48 },
      { header: "Adet", key: "quantity", width: 10 },
      { header: "Birim Fiyat", key: "unitPrice", width: 16 },
      { header: "Matrah", key: "net", width: 16 },
      { header: "KDV Oranı (%)", key: "vatRate", width: 14 },
      { header: "KDV", key: "taxAmount", width: 16 },
      { header: "Toplam", key: "total", width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const line of lines) sheet.addRow(line);
    for (const key of ["unitPrice", "net", "taxAmount", "total"])
      sheet.getColumn(key).numFmt = MONEY;
    sheet.getColumn("vatRate").numFmt = "0.00";
  }

  /**
   * Kaynak işlem. Tek kalemli hizmet faturasında asıl bilgi burasıdır: belge
   * "hizmet bedeli" der, bu sayfa hangi kolinin hangi ürünlerinden doğduğunu.
   */
  private addSourceSheet(
    workbook: ExcelJS.Workbook,
    source: InvoiceSourceRow[],
  ): void {
    const sheet = workbook.addWorksheet("Kaynak İşlem");
    sheet.columns = [
      { header: "Referans", key: "reference", width: 22 },
      { header: "Açıklama", key: "description", width: 52 },
      { header: "Adet", key: "quantity", width: 10 },
      { header: "Tutar", key: "amount", width: 16 },
      { header: "Tarih", key: "occurredAt", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    if (source.length === 0) {
      sheet.addRow({
        description:
          "Kaynak işlem kaydı bulunamadı (silinmiş veya eski kayıt).",
      });
      return;
    }
    for (const row of source) sheet.addRow(row);
    sheet.getColumn("amount").numFmt = MONEY;
    sheet.getColumn("occurredAt").numFmt = DATE;
  }
}
