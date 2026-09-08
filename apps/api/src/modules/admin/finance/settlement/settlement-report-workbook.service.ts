import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import type { SettlementRow } from "./settlement-report-row";

/**
 * Hakediş dökümünün Excel çıktısı.
 *
 * Kolon listesi TEK yerde durur (`COLUMNS`): başlık, alan ve biçim birlikte
 * tanımlanır, aksi halde başlıkla veri sessizce kayardı. İkinci sayfa
 * kolonların ANLAMINI taşır — dosya mali müşavire tek başına gider, ekrana
 * dönüp "Tarodan Hakedişi neyi kapsıyor?" diye sorulamaz.
 */

type Format = "text" | "money" | "percent" | "date" | "int";

interface Column {
  header: string;
  key: keyof SettlementRow;
  width: number;
  format: Format;
  /** Açıklama sayfasında kolonun ne olduğu. */
  note: string;
}

const MONEY = '#,##0.00" ₺"';
const DATE = "dd.mm.yyyy hh:mm";

const COLUMNS: Column[] = [
  {
    header: "Kayıt No",
    key: "recordNo",
    width: 20,
    format: "text",
    note: "Fatura kayıt no. Bu alışverişten doğan TÜM faturaların (alıcı komisyonu, kargo, hizmet bedeli) üstünde aynı kod yazar; belgeyi bu satıra bununla bağlarsınız.",
  },
  {
    header: "İşlem Tipi",
    key: "transactionType",
    width: 16,
    format: "text",
    note: "Satış / Teklif Satışı / Platform Hizmeti / İade / İptal.",
  },
  {
    header: "Sipariş No",
    key: "orderNumber",
    width: 20,
    format: "text",
    note: "Siparişin kendi numarası (bir kolide birden fazla olabilir).",
  },
  {
    header: "Sipariş Tarihi",
    key: "orderedAt",
    width: 18,
    format: "date",
    note: "Siparişin oluşturulduğu an.",
  },
  {
    header: "Ülke",
    key: "country",
    width: 10,
    format: "text",
    note: "Platform yalnız Türkiye'ye satış yapar.",
  },
  {
    header: "İşlem Tarihi",
    key: "transactionAt",
    width: 18,
    format: "date",
    note: "Ödemenin alındığı an; ödeme kaydı yoksa sipariş tarihi.",
  },
  {
    header: "Satıcı ID",
    key: "sellerId",
    width: 38,
    format: "text",
    note: "Satıcının sistem kimliği.",
  },
  {
    header: "Satıcı",
    key: "sellerName",
    width: 26,
    format: "text",
    note: "Mağaza adı.",
  },
  {
    header: "Satıcı Cari Adı",
    key: "sellerCompanyName",
    width: 38,
    format: "text",
    note: "Kurumsal satıcının ticaret unvanı; bireysel satıcıda boştur.",
  },
  {
    header: "Ürün Adı",
    key: "productName",
    width: 40,
    format: "text",
    note: "İlan başlığı.",
  },
  {
    header: "Ürün Kodu",
    key: "productCode",
    width: 18,
    format: "text",
    note: "Ürünün sistem kodu.",
  },
  {
    header: "Komisyon Oranı (%)",
    key: "commissionRate",
    width: 18,
    format: "percent",
    note: "SATICI komisyonunun oranı — satıcıya kesilen komisyon faturasının konusu budur. Alıcıdan alınan komisyon buraya girmez.",
  },
  {
    header: "Tarodan Hakedişi",
    key: "platformEarning",
    width: 18,
    format: "money",
    note: "Satıcıdan yapılan kesinti: satıcı komisyonu + platform hizmet bedeli (KDV hariç), İADE DÜŞÜLMÜŞ. İade edilen sipariş 0'a iner; iade tahsil edileni aşarsa tutar eksiye döner. Alıcıdan alınan komisyon/koruma bedeli buraya GİRMEZ.",
  },
  {
    header: "Satıcı Hakedişi",
    key: "sellerEarning",
    width: 18,
    format: "money",
    note: "Satıcıya ödenen net tutar (escrow'da ayrılan, iade düşülmüş): ürün bedeli − satıcı ücretleri − hizmet KDV'si − stopaj − satıcı kargo payı, varsa platform-fonlu kupon payı eklenmiş.",
  },
  {
    header: "Stopaj",
    key: "withholdingTax",
    width: 14,
    format: "money",
    note: "GVK 94/19 tevkifatı. Yalnız kurumsal (vergi mükellefi) satıcıdan, KDV hariç ürün bedeli üzerinden kesilir; muhtasar ile beyan edilir.",
  },
  {
    header: "Vade Süresi (gün)",
    key: "maturityDays",
    width: 16,
    format: "int",
    note: "Teslimat ile hak edişin serbest bırakılması arasındaki gün sayısı.",
  },
  {
    header: "Teslim Tarihi",
    key: "deliveredAt",
    width: 18,
    format: "date",
    note: "Kargonun teslim edildiği an; hak ediş ve fatura bu anla doğar.",
  },
  {
    header: "Vade Tarihi",
    key: "maturityAt",
    width: 18,
    format: "date",
    note: "Hak edişin satıcıya serbest bırakıldığı/bırakılacağı an.",
  },
  {
    header: "Ürün Tutarı",
    key: "listingPrice",
    width: 20,
    format: "money",
    note: "Komisyonun hesaplandığı ürün tutarı (KDV hariç, indirim ve kupon sonrası). Komisyon Oranı × bu tutar = Tarodan Hakedişinin komisyon kısmı. Alıcının ödediği toplam DEĞİLDİR — ona kargo ve hizmet bedelleri eklenir.",
  },
  {
    header: "Müşteri ID",
    key: "customerId",
    width: 38,
    format: "text",
    note: "Alıcının sistem kimliği.",
  },
  {
    header: "Müşteri Ad Soyad",
    key: "customerName",
    width: 26,
    format: "text",
    note: "Alıcı adı; misafir siparişinde kargo adresindeki isim.",
  },
];

@Injectable()
export class SettlementReportWorkbookService {
  filename(startDate?: string, endDate?: string): string {
    const period = [startDate, endDate].filter(Boolean).join("_");
    return period
      ? `tarodan-hakedis-dokumu-${period}.xlsx`
      : "tarodan-hakedis-dokumu.xlsx";
  }

  async build(rows: SettlementRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tarodan";
    workbook.company = "Tarodan";
    workbook.title = "Tarodan Satıcı Hakediş Dökümü";

    this.addDataSheet(workbook, rows);
    this.addGuideSheet(workbook);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private addDataSheet(
    workbook: ExcelJS.Workbook,
    rows: SettlementRow[],
  ): void {
    const sheet = workbook.addWorksheet("Hakedis", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow(row);
    }

    COLUMNS.forEach((column, index) => {
      const cells = sheet.getColumn(index + 1);
      if (column.format === "money") cells.numFmt = MONEY;
      else if (column.format === "percent") cells.numFmt = "0.00";
      else if (column.format === "date") cells.numFmt = DATE;
      else if (column.format === "int") cells.numFmt = "0";
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: COLUMNS.length },
    };
  }

  private addGuideSheet(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet("Aciklama");
    sheet.columns = [
      { header: "Sütun", key: "header", width: 24 },
      { header: "Anlamı", key: "note", width: 110 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const column of COLUMNS) {
      sheet.addRow({ header: column.header, note: column.note });
    }
    sheet.addRow({});
    sheet.addRow({
      header: "Dönem",
      note: "Satırlar TESLİMAT tarihine göre süzülür — hak ediş ve fatura teslimatla doğar.",
    });
    sheet.addRow({
      header: "Tutarlar",
      note: "Aksi belirtilmedikçe KDV hariçtir ve iade düşülmüştür; kolonun toplamı doğrudan alınabilir.",
    });
    sheet.addRow({
      header: "Kapsam",
      note: "Dönemin TÜM satırları yazılır, dosya kesilmez.",
    });
  }
}

export const SETTLEMENT_REPORT_COLUMNS = COLUMNS;
