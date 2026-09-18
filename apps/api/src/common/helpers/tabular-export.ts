import * as ExcelJS from "exceljs";

/**
 * Tablo dışa aktarımının TEK yazıcısı — CSV ve XLSX.
 *
 * Her rapor kendi CSV'sini elle birleştiriyordu ve hiçbiri alanları
 * tırnaklamıyordu: satıcı adında bir virgül dosyanın kolonlarını kaydırıyor,
 * bir satır sonu kaydı ikiye bölüyordu. Artık tek yazıcı var; yeni bir raporun
 * kendi sürümünü uydurması gerekmiyor.
 */

export type Cell = string | number | null | undefined;

export interface ExportColumn<T> {
  /** Başlık satırında görünen ad (çağıran tarafından zaten çevrilmiş). */
  header: string;
  value: (row: T) => Cell;
}

/**
 * Hücrelere indirgenmiş bir sayfa. Sütun tanımları burada TÜKENİR, bu yüzden
 * farklı satır tiplerinden gelen sayfalar tek bir çalışma kitabında yan yana
 * durabilir — generic'i kaybetmek için `any`ye düşmeden.
 */
export interface RenderedSheet {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export function renderSheet<T>(
  name: string,
  columns: ExportColumn<T>[],
  rows: T[],
): RenderedSheet {
  return {
    name,
    headers: columns.map((column) => column.header),
    rows: rows.map((row) => columns.map((column) => column.value(row))),
  };
}

/**
 * Bir hücrenin elektronik tabloda FORMÜL olarak yorumlanmasını engeller.
 *
 * Excel ve Google Sheets `=`, `+`, `-`, `@` ve sekme/satır başı ile başlayan
 * hücreyi formül sayar: kullanıcının yazdığı bir ürün başlığı, dosyayı açan
 * kişinin makinesinde çalışan bir komuta dönüşebilir (CSV injection). Tek
 * tırnak öneki hücreyi metne sabitler.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: tırnak ikilenir; ayırıcı/tırnak/satır sonu içeren alan sarılır. */
export function csvField(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV gövdesi. Excel'in UTF-8'i tanıması için BOM ile başlar — onsuz Türkçe
 * karakterler bozuk açılır. Birden fazla sayfa varsa her biri kendi başlık
 * satırıyla, aralarında boş satırla yazılır (CSV'nin sekmesi yoktur).
 */
export function toCsv(sheets: RenderedSheet[]): string {
  const line = (cells: Cell[]) => cells.map(csvField).join(",");

  const blocks = sheets.map((sheet) =>
    [line([sheet.name]), line(sheet.headers), ...sheet.rows.map(line)].join(
      "\r\n",
    ),
  );

  return "﻿" + blocks.join("\r\n\r\n");
}

/**
 * XLSX gövdesi. Katalog içe aktarımının kullandığı ExcelJS'in aynısı — ikinci
 * bir elektronik tablo kütüphanesi eklenmez.
 *
 * Sayılar SAYI olarak yazılır (metne çevrilmiş bir tutarla toplam alınamaz);
 * metinler yine formüle karşı nötrlenir.
 */
export async function toXlsx(sheets: RenderedSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  sheets.forEach((sheet, index) => {
    // 31 karakter ve `[]:*?/\` Excel'in sayfa adı sınırıdır; aşan ad dosyayı
    // açılmaz hâle getirir. Boş ad da geçersiz, bu yüzden sıra numarasına
    // düşülür.
    const name =
      sheet.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) ||
      `Sheet${index + 1}`;
    const worksheet = workbook.addWorksheet(name);

    worksheet.addRow(sheet.headers).font = { bold: true };

    for (const row of sheet.rows) {
      worksheet.addRow(
        row.map((value) => {
          if (value === null || value === undefined) return "";
          return typeof value === "number"
            ? value
            : neutralizeFormula(String(value));
        }),
      );
    }
  });

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}
