import { BadRequestException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import * as path from "path";
import { i18nMessage } from "../../modules/i18n";

/**
 * Excel toplu içe aktarma ayrıştırıcıları — ürün ve katalog (marka / üretici /
 * araç modeli) akışlarının ORTAK gövdesi.
 *
 * Bu yardımcılar `AdminProductBulkImportService` içinde private metotlardı;
 * ikinci bir içe aktarma akışı eklenince kopyalanmaları gerekirdi. Kopya,
 * "1.234,56" gibi Türkçe sayı biçimi veya "evet/hayır" eşlemesi gibi kuralların
 * iki yerde ayrışması demektir — kullanıcı aynı hücreyi iki ekranda farklı
 * sonuçla görürdü.
 */

/** İçe aktarmada id / ad / slug üçünden biriyle eşleştirilebilen katalog kaydı. */
export type CatalogRef = { id: string; name: string; slug: string };

/**
 * Başlık hücresini kanonik anahtara indirger: "Kurulus Yili" → "kurulus_yili".
 *
 * Küçük harfe çevirme BİLİNÇLİ olarak dilden bağımsız: başlık anahtarları ASCII
 * ("kurulus_yili", "web_sitesi") ve Türkçe yerelde "I" harfi "ı"ya inerdi —
 * kullanıcı başlık satırını büyük harfle yazdığında "KURULUS_YILI" →
 * "kurulus_yılı" olur, hiçbir anahtarla eşleşmez ve gözle görülür duran sütun
 * "eksik" raporlanırdı.
 */
export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Dosya adını yol ve büyük/küçük harf farklarından arındırır. */
export function normalizeFilename(value: string): string {
  return path
    .basename(value.replace(/\\/g, "/"))
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

/** Hücre değerinin düz metin karşılığı (zengin metin ve köprü dahil). */
export function cellText(value: ExcelJS.CellValue | undefined | null): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("richText" in value)
      return value.richText
        .map((item) => item.text)
        .join("")
        .trim();
  }
  return String(value).trim();
}

/**
 * Sayı okur; boşsa `undefined`. Türkçe biçimi ("1.234,56") ve ₺/TL ekini
 * tolere eder — kullanıcılar hücreyi Excel'de para birimi olarak biçimliyor.
 */
export function optionalNumber(
  value: ExcelJS.CellValue | undefined | null,
): number | undefined {
  if (value == null || cellText(value) === "") return undefined;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new Error(`geçersiz sayısal değer: ${cellText(value)}`);
  }
  let text = cellText(value).replace(/\s/g, "").replace(/₺|TL/gi, "");
  if (text.includes(",") && text.includes(".")) {
    text =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new Error(`geçersiz sayısal değer: ${cellText(value)}`);
  }
  return parsed;
}

/** Zorunlu sayı; boşsa alan adıyla birlikte hata. */
export function requiredNumber(
  value: ExcelJS.CellValue | undefined | null,
  label: string,
): number {
  const parsed = optionalNumber(value);
  if (parsed == null) throw new Error(`${label} zorunlu ve sayısal olmalıdır`);
  return parsed;
}

export function optionalDate(
  value: ExcelJS.CellValue | undefined | null,
): Date | undefined {
  if (value == null || cellText(value) === "") return undefined;
  const date = value instanceof Date ? value : new Date(cellText(value));
  if (Number.isNaN(date.getTime()))
    throw new Error(`geçersiz tarih: ${cellText(value)}`);
  return date;
}

/** "evet/hayır" sütunu; `defaultValue` verilmezse boş hücre hatadır. */
export function parseBoolean(
  value: ExcelJS.CellValue | undefined | null,
  defaultValue?: boolean,
): boolean {
  if (value == null || cellText(value) === "") {
    if (defaultValue != null) return defaultValue;
    throw new Error("evet/hayır alanı zorunludur");
  }
  if (typeof value === "boolean") return value;
  const normalized = cellText(value).toLocaleLowerCase("tr-TR");
  if (["evet", "true", "1", "yes"].includes(normalized)) return true;
  if (["hayır", "hayir", "false", "0", "no"].includes(normalized)) return false;
  throw new Error(`geçersiz evet/hayır değeri: ${cellText(value)}`);
}

/** Virgülle ayrılmış hücreyi listeye çevirir. */
export function csvList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Katalog referansını id, ad veya slug ile çözer. Kullanıcıdan hangisini
 * yazdığını bilmesini beklemek yerine üçünü de kabul ederiz.
 */
export function resolveRef<T extends CatalogRef>(
  items: T[],
  input: string,
  label: string,
): T {
  const normalized = input.trim().toLocaleLowerCase("tr-TR");
  const match = items.find(
    (item) =>
      item.id.toLocaleLowerCase("tr-TR") === normalized ||
      item.name.trim().toLocaleLowerCase("tr-TR") === normalized ||
      item.slug.trim().toLocaleLowerCase("tr-TR") === normalized,
  );
  if (!match)
    throw new Error(`${label} bulunamadı veya pasif: ${input || "(boş)"}`);
  return match;
}

/** Dosyayı okur ve beklenen sayfayı döndürür. */
export async function loadImportSheet(
  buffer: Buffer,
  sheetName: string,
): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException(
      i18nMessage("server.admin.bulkImport.excelUnreadable"),
    );
  }

  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new BadRequestException(
      i18nMessage("server.admin.bulkImport.sheetMissing", {
        sheet: sheetName,
      }),
    );
  }
  return sheet;
}

/**
 * Formül içeren dosyaları reddeder: ExcelJS formülün önbelleklenmiş sonucunu
 * okur, yani dosyayı hazırlayan kişi hücrede gördüğünden farklı bir değeri
 * içe aktarabilirdi.
 */
export function assertNoFormulas(
  sheet: ExcelJS.Worksheet,
  sheetName: string,
): void {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (
        value &&
        typeof value === "object" &&
        ("formula" in value || "sharedFormula" in value)
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.bulkImport.formulaNotAllowed", {
            sheet: sheetName,
            cell: cell.address,
          }),
        );
      }
    });
  }
}

/** Başlık satırını `kanonik başlık → sütun numarası` haritasına çevirir. */
export function readHeaderMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = normalizeHeader(cell.text);
    if (header) headers.set(header, column);
  });
  return headers;
}

/** Şablonun altına eklenmiş boş/biçimlendirilmiş satırları eler. */
export function collectDataRowNumbers(sheet: ExcelJS.Worksheet): number[] {
  const rowNumbers: number[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values;
    const cells = Array.isArray(values) ? values : [];
    if (cells.some((value) => value != null && String(value).trim())) {
      rowNumbers.push(rowNumber);
    }
  }
  return rowNumbers;
}
