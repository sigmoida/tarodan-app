import * as ExcelJS from "exceljs";
import { SettlementReportWorkbookService } from "./settlement-report-workbook.service";
import type { SettlementRow } from "./settlement-report-row";

/**
 * Dosya müşavire TEK BAŞINA gider: başlıklar veriyle hizalı olmalı ve kolonun
 * ne anlama geldiği dosyanın içinde yazmalı. Başlık/alan kayması sessizdir —
 * yanlış kolondaki tutar fark edilmeden beyana girer.
 */

const row: SettlementRow = {
  recordNo: "PKG-000123",
  transactionType: "Satış",
  orderNumber: "ORD-10001",
  orderedAt: new Date("2026-08-01T10:00:00Z"),
  country: "Türkiye",
  transactionAt: new Date("2026-08-01T10:05:00Z"),
  sellerId: "s1",
  sellerName: "Toolstoy",
  sellerCompanyName: "SERHATLAR LTD ŞTİ",
  productName: "Oyuncak Araba",
  productCode: "U-10042",
  commissionRate: 6,
  platformEarning: 109.89,
  sellerEarning: 785.14,
  withholdingTax: 9.99,
  maturityDays: 6,
  deliveredAt: new Date("2026-08-04T12:00:00Z"),
  maturityAt: new Date("2026-08-10T12:00:00Z"),
  listingPrice: 999,
  customerId: "b1",
  customerName: "Ayşe Yılmaz",
};

async function read(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("SettlementReportWorkbookService", () => {
  const service = new SettlementReportWorkbookService();

  it("21 kolonu başlıklarıyla hizalı yazar", async () => {
    const workbook = await read(await service.build([row]));
    const sheet = workbook.getWorksheet("Hakedis")!;

    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headers).toHaveLength(21);
    expect(headers[0]).toBe("Kayıt No");
    expect(headers[14]).toBe("Stopaj");
    expect(headers[20]).toBe("Müşteri Ad Soyad");

    const data = sheet.getRow(2);
    expect(data.getCell(1).value).toBe("PKG-000123");
    // Tutar kolonları gerçekten kendi değerlerini taşıyor — kayma yok.
    expect(data.getCell(13).value).toBe(109.89); // Tarodan Hakedişi
    expect(data.getCell(14).value).toBe(785.14); // Satıcı Hakedişi
    expect(data.getCell(15).value).toBe(9.99); // Stopaj
    expect(data.getCell(21).value).toBe("Ayşe Yılmaz");
  });

  it("kolonların anlamını dosyanın içinde taşır", async () => {
    const workbook = await read(await service.build([row]));
    const guide = workbook.getWorksheet("Aciklama")!;
    const notes = new Map<string, string>();
    guide.eachRow((r, i) => {
      if (i === 1) return;
      notes.set(
        String(r.getCell(1).value ?? ""),
        String(r.getCell(2).value ?? ""),
      );
    });

    expect(notes.get("Tarodan Hakedişi")).toContain("Alıcıdan alınan");
    expect(notes.get("Komisyon Oranı (%)")).toContain("SATICI");
    expect(notes.get("Stopaj")).toContain("muhtasar");
  });

  it("satır yoksa da geçerli bir dosya üretir", async () => {
    const workbook = await read(await service.build([]));
    expect(workbook.getWorksheet("Hakedis")!.rowCount).toBe(1);
  });

  it("dosya adı dönemi taşır", () => {
    expect(service.filename("2026-08-01", "2026-08-31")).toBe(
      "tarodan-hakedis-dokumu-2026-08-01_2026-08-31.xlsx",
    );
    expect(service.filename()).toBe("tarodan-hakedis-dokumu.xlsx");
  });
});
