import * as ExcelJS from "exceljs";
import type { MessageValues } from "@tarodan/i18n";
import type { ExportColumn, ExportColumnType } from "@tarodan/types";

import { istanbulWallClock } from "../helpers/tr-calendar";
import { neutralizeFormula } from "./formula-neutralize";

/**
 * Admin Excel dökümlerinin TEK yazıcısı.
 *
 * Dökümler sekiz ayrı yolla üretiliyordu (elle CSV, ham ExcelJS, paylaşılan
 * yazıcı): tarihler UTC, CSV Türkçe Excel'de tek kolonda açılıyor, negatif
 * tutarlar metne dönüyordu. Bu yazıcı saftır — satırları, kolonları ve özeti
 * alır, dosyayı döner; veri okumaz, denetim yazmaz (o iş `ExportListService`).
 *
 * Kitap şekli: 1. sayfa "Özet" (rapor, oluşturulma anı, filtreler, kayıt
 * sayısı, toplamlar, notlar), ardından veri sayfaları, ardından varsa
 * sözleşmeli ek sayfalar (resmî bildirimin Bilgi sayfası gibi).
 */

/** Eşleyicinin bir hücre için döndürebileceği değer. */
export type ExportCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

/** Bir veri satırı: kolon anahtarı → değer. Eksik anahtar boş hücredir. */
export type ExportRecord<K extends string = string> = {
  readonly [P in K]?: ExportCellValue;
};

/** Katalog anahtarını isteğin dilinde metne çeviren fonksiyon. */
export type Translate = (key: string, values?: MessageValues) => string;

/** Başlığı çözülmüş kolon — katalogdan ya da (analitik) alan adından. */
export interface WorkbookColumn {
  key: string;
  header: string;
  type: ExportColumnType;
  masked?: boolean;
}

export interface WorkbookDataSheet {
  name: string;
  columns: readonly WorkbookColumn[];
  records: readonly ExportRecord[];
}

/** Özet / ek sayfa satırı: etiket (çevrilmiş) + değer. */
export interface WorkbookSummaryRow {
  label: string;
  value: ExportCellValue;
  type?: ExportColumnType;
}

export interface WorkbookSummary {
  title: string;
  generatedAt: Date;
  filters: readonly WorkbookSummaryRow[];
  rowCount: number;
  /** Uzun biçimde veri sayfasındaki kalem satırı sayısı. */
  lineCount?: number;
  /** Üst kayıt toplamları — veri sayfasında toplanmaz, burada durur. */
  totals?: readonly WorkbookSummaryRow[];
  /** Kırpılma, uzun biçim gibi çevrilmiş uyarılar. */
  notes?: readonly string[];
}

export interface WorkbookAppendixSheet {
  name: string;
  rows: readonly WorkbookSummaryRow[];
}

export interface WorkbookInput {
  summary: WorkbookSummary;
  sheets: readonly WorkbookDataSheet[];
  appendix?: readonly WorkbookAppendixSheet[];
  t: Translate;
  /** `masked` kolonları açık yaz — yalnız ucun yetkisi bunu taşıyorsa. */
  unmask: boolean;
}

/** Tip başına hücre biçimi. Para birimi sembolü biçimde, değer SAYI kalır. */
export const EXPORT_NUM_FMT: Partial<Record<ExportColumnType, string>> = {
  money: "#,##0.00 ₺",
  date: "dd.mm.yyyy",
  datetime: "dd.mm.yyyy hh:mm",
};

/** Tip başına kolon genişliği (karakter). Başlık daha uzunsa başlık kazanır. */
export const EXPORT_COLUMN_WIDTH: Record<ExportColumnType, number> = {
  text: 28,
  number: 12,
  money: 16,
  date: 12,
  datetime: 17,
  boolean: 9,
  status: 20,
};

/** Katalog kolonlarının başlıklarını isteğin dilinde çözer. */
export function catalogColumns(
  columns: readonly ExportColumn[],
  t: Translate,
): WorkbookColumn[] {
  return columns.map((column) => ({
    key: column.key,
    header: t(column.labelKey),
    type: column.type,
    masked: column.masked,
  }));
}

/**
 * Maskeli değer: yalnız son dört karakter görünür, önek sabit genişliktedir —
 * değerin uzunluğu da sızmaz (panelin `MaskedValue` ilkesiyle aynı).
 */
export function maskExportValue(value: string): string {
  const compact = value.replace(/\s/g, "");
  return compact.length > 4 ? `••••${compact.slice(-4)}` : "••••";
}

export async function buildExportWorkbook(
  input: WorkbookInput,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tarodan";
  workbook.company = "Tarodan";
  workbook.title = input.summary.title;
  workbook.created = input.summary.generatedAt;

  const names = new SheetNames();
  writeSummarySheet(workbook, names, input);
  for (const sheet of input.sheets) {
    writeDataSheet(workbook, names, sheet, input.t, input.unmask);
  }
  for (const sheet of input.appendix ?? []) {
    writeLabelValueSheet(
      workbook.addWorksheet(names.claim(sheet.name)),
      sheet.rows,
      input.t,
    );
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Bir değeri kolon tipine göre hücreye çevirir. */
export function toCellValue(
  value: ExportCellValue,
  column: Pick<WorkbookColumn, "type" | "masked">,
  t: Translate,
  unmask = false,
): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (column.masked && !unmask) {
    return maskExportValue(value instanceof Date ? "" : String(value));
  }

  switch (column.type) {
    case "money":
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : textCell(value, t);
    case "date":
    case "datetime": {
      const at = toDate(value);
      return at ? istanbulWallClock(at) : textCell(value, t);
    }
    default:
      return textCell(value, t);
  }
}

/** Metin hücresi: yalnız METİN nötrlenir; sayı sayı, evet/hayır çevrilir. */
function textCell(
  value: Exclude<ExportCellValue, null | undefined>,
  t: Translate,
): ExcelJS.CellValue {
  if (typeof value === "string") return neutralizeFormula(value);
  if (typeof value === "boolean") return t(value ? "common.yes" : "common.no");
  if (value instanceof Date) return istanbulWallClock(value);
  return value;
}

function toDate(value: Exclude<ExportCellValue, null | undefined>) {
  const at =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  names: SheetNames,
  input: WorkbookInput,
): void {
  const { summary, t } = input;
  const rows: Array<WorkbookSummaryRow | string | null> = [
    { label: t("server.export.summary.report"), value: summary.title },
    {
      label: t("server.export.summary.generatedAt"),
      value: summary.generatedAt,
      type: "datetime",
    },
    {
      label: t("server.export.summary.rowCount"),
      value: summary.rowCount,
      type: "number",
    },
    ...(summary.lineCount !== undefined
      ? [
          {
            label: t("server.export.summary.lineCount"),
            value: summary.lineCount,
            type: "number" as const,
          },
        ]
      : []),
    null,
    t("server.export.summary.filters"),
    ...(summary.filters.length > 0
      ? summary.filters
      : [{ label: t("server.export.summary.noFilters"), value: null }]),
    ...(summary.totals?.length
      ? [null, t("server.export.summary.totals"), ...summary.totals]
      : []),
    ...(summary.notes?.length
      ? [
          null,
          t("server.export.summary.notes"),
          ...summary.notes.map((note) => ({ label: note, value: null })),
        ]
      : []),
  ];

  const sheet = workbook.addWorksheet(
    names.claim(t("server.export.summary.sheetName")),
  );
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 60;
  for (const row of rows) {
    if (row === null) {
      sheet.addRow([]);
    } else if (typeof row === "string") {
      // Bölüm başlığı.
      sheet.addRow([row]).font = { bold: true };
    } else {
      addLabelValueRow(sheet, row, t);
    }
  }
}

function writeLabelValueSheet(
  sheet: ExcelJS.Worksheet,
  rows: readonly WorkbookSummaryRow[],
  t: Translate,
): void {
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 60;
  for (const row of rows) addLabelValueRow(sheet, row, t);
}

function addLabelValueRow(
  sheet: ExcelJS.Worksheet,
  row: WorkbookSummaryRow,
  t: Translate,
): void {
  const type = row.type ?? "text";
  const added = sheet.addRow([
    neutralizeFormula(row.label),
    toCellValue(row.value, { type }, t, true),
  ]);
  added.getCell(1).font = { bold: true };
  const numFmt = EXPORT_NUM_FMT[type];
  if (numFmt) added.getCell(2).numFmt = numFmt;
}

function writeDataSheet(
  workbook: ExcelJS.Workbook,
  names: SheetNames,
  data: WorkbookDataSheet,
  t: Translate,
  unmask: boolean,
): void {
  const sheet = workbook.addWorksheet(names.claim(data.name), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = data.columns.map((column) => ({
    key: column.key,
    width: Math.max(EXPORT_COLUMN_WIDTH[column.type], column.header.length + 2),
    style: EXPORT_NUM_FMT[column.type]
      ? { numFmt: EXPORT_NUM_FMT[column.type] }
      : {},
  }));

  const header = sheet.addRow(data.columns.map((column) => column.header));
  header.font = { bold: true };

  for (const record of data.records) {
    sheet.addRow(
      data.columns.map((column) =>
        toCellValue(record[column.key], column, t, unmask),
      ),
    );
  }

  if (data.columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1 + data.records.length, column: data.columns.length },
    };
  }
}

/**
 * Excel sayfa adı kuralları: en çok 31 karakter, `[]:*?/\` yok, boş değil ve
 * kitapta tekil (büyük/küçük harf duyarsız). Aşan ad dosyayı açılmaz yapar.
 */
class SheetNames {
  private readonly used = new Set<string>();

  claim(raw: string): string {
    const base =
      raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) ||
      `Sheet${this.used.size + 1}`;
    let name = base;
    for (let n = 2; this.used.has(name.toLocaleLowerCase("tr")); n++) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    this.used.add(name.toLocaleLowerCase("tr"));
    return name;
  }
}
