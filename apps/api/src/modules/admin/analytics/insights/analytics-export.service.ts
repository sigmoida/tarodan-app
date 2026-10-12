import { Injectable } from "@nestjs/common";
import type { Locale } from "@tarodan/i18n";
import type {
  AnalyticsMetric,
  AnalyticsRange,
  AnalyticsRangeQuery,
  AnalyticsSeries,
  AnalyticsTab,
  ExportColumnType,
} from "@tarodan/types";
import {
  ExportListService,
  type ExportCellValue,
  type ExportFile,
  type ExportRecord,
  type WorkbookColumn,
  type WorkbookDataSheet,
} from "../../../../common/export";
import { trCalendarDate } from "../../../../common/helpers/tr-calendar";
import { AnalyticsCatalogService } from "./analytics-catalog.service";
import { AnalyticsMembershipService } from "./analytics-membership.service";
import { AnalyticsQualityService } from "./analytics-quality.service";
import { AnalyticsSalesService } from "./analytics-sales.service";
import { AnalyticsTradeService } from "./analytics-trade.service";

/** A metric map is an object whose values all carry `current`. */
function isMetricMap(value: unknown): value is Record<string, AnalyticsMetric> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const values = Object.values(value as Record<string, unknown>);
  return (
    values.length > 0 &&
    values.every(
      (entry) =>
        typeof entry === "object" && entry !== null && "current" in entry,
    )
  );
}

/**
 * Boş dizi hiçbir şekle UYMAZ: `every` boş dizide true döndüğü için boş bir
 * kırılım seri sanılıp yalnız "bucket" başlığı olan boş bir sayfa açıyordu.
 */
function isSeriesList(value: unknown): value is AnalyticsSeries[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "key" in entry &&
        "points" in entry,
    )
  );
}

function isRowList(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "object" && entry !== null)
  );
}

/** Yanıttaki bir hücre değeri — iç içe nesne dosyaya JSON metni olarak gider. */
function cellOf(value: unknown): ExportCellValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Kolon tipi değerlerden: dolu her hücre sayıysa SAYI kolonu. Eski CSV
 * yazıcısı her değeri metne çevirip nötrlüyordu; negatif bir değişim yüzdesi
 * `'-12.5` metnine dönüşüp toplanamıyordu.
 */
function inferType(values: readonly ExportCellValue[]): ExportColumnType {
  const filled = values.filter((v) => v !== null && v !== undefined);
  return filled.length > 0 && filled.every((v) => typeof v === "number")
    ? "number"
    : "text";
}

/** Başlıklar ALAN ADLARIDIR — bkz. sınıf açıklaması. */
function fieldSheet(
  name: string,
  headers: readonly string[],
  records: readonly ExportRecord[],
): WorkbookDataSheet {
  const columns: WorkbookColumn[] = headers.map((header) => ({
    key: header,
    header,
    type: inferType(records.map((record) => record[header])),
  }));
  return { name, columns, records };
}

/**
 * Dışa aktarım — ekranla AYNI hesaplamadan.
 *
 * Eski uçlar raporu bir kez ekran için, bir kez dosya için hesaplıyordu; iki
 * hesabın ayrışması an meselesiydi. Burada dosya, sekmenin KENDİ servisinden
 * dönen yanıtın birebir kendisidir: ekranda 12.480 ₺ yazıyorsa dosyada da
 * 12.480 ₺ yazar, çünkü aynı nesne.
 *
 * Sayfalar yanıtın şeklinden türetilir (metrikler, seriler, kırılımlar,
 * huniler); yeni bir kırılım eklendiğinde dışa aktarıma elle bir kolon
 * eklemek gerekmez.
 *
 * Başlıklar ALAN ADLARIDIR, çeviri değil: dosya çoğunlukla başka bir tabloya
 * ya da muhasebeye aktarılıyor ve orada sabit, makine-okunur bir anahtar
 * lazım. Etiketleme ekranın işi. Bu yüzden analitik, kolon kataloğu
 * (`EXPORT_CATALOGS`) OLMAYAN tek dökümdür; yazıcı, Özet sayfası, yanıt
 * başlıkları ve denetim diğer dökümlerle ortaktır. Yalnız XLSX.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly sales: AnalyticsSalesService,
    private readonly trade: AnalyticsTradeService,
    private readonly catalog: AnalyticsCatalogService,
    private readonly quality: AnalyticsQualityService,
    private readonly membership: AnalyticsMembershipService,
    private readonly exports: ExportListService,
  ) {}

  async export(
    tab: AnalyticsTab,
    query: AnalyticsRangeQuery | undefined,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    const response = await this.load(tab, query);
    const range = (response as { range: AnalyticsRange }).range;
    const sheets = this.toSheets(response);
    const from = trCalendarDate(new Date(range.from));
    const to = trCalendarDate(new Date(range.to));

    return this.exports.exportSheets({
      locale,
      resource: "analytics",
      slug: `analitik-${tab}-${from}-${to}`,
      titleKey: `admin.analytics.tabs.${tab}`,
      filters: [
        { labelKey: "admin.analytics.filters.from", value: from },
        { labelKey: "admin.analytics.filters.to", value: to },
        {
          labelKey: "admin.analytics.filters.groupBy",
          value: range.groupBy,
          valueKey: `admin.analytics.filters.${range.groupBy}`,
        },
        { labelKey: "admin.analytics.filters.compare", value: range.compared },
      ],
      rowCount: sheets.reduce((sum, sheet) => sum + sheet.records.length, 0),
      sheets: () => sheets,
      audit: {
        actorId,
        action: "analytics_export",
        entityType: "Analytics",
        entityId: tab,
        query: query ?? {},
      },
    });
  }

  private load(tab: AnalyticsTab, query: AnalyticsRangeQuery | undefined) {
    switch (tab) {
      case "trade":
        return this.trade.get(query);
      case "catalog":
        return this.catalog.get(query);
      case "quality":
        return this.quality.get(query);
      case "membership":
        return this.membership.get(query);
      case "sales":
      default:
        return this.sales.get(query);
    }
  }

  private toSheets(response: object): WorkbookDataSheet[] {
    const sheets: WorkbookDataSheet[] = [];

    // Sekme yanıtları birbirinden farklı arayüzler; sayfalar ALANLARIN
    // ŞEKLİNDEN türetildiği için burada tek ortak okuma biçimine indirilir.
    const entries = Object.entries(response) as Array<[string, unknown]>;

    for (const [field, value] of entries) {
      // `range` Özet'te ve dosya adında zaten var.
      if (field === "range") continue;

      if (isMetricMap(value)) {
        sheets.push(this.metricsSheet(field, value));
      } else if (isSeriesList(value)) {
        sheets.push(this.seriesSheet(field, value));
      } else if (isRowList(value) && value.length > 0) {
        sheets.push(this.rowsSheet(field, value));
      }
    }

    return sheets;
  }

  private metricsSheet(
    name: string,
    metrics: Record<string, AnalyticsMetric>,
  ): WorkbookDataSheet {
    const records = Object.entries(metrics).map(([key, value]) => ({
      metric: key,
      current: value.current,
      previous: value.previous,
      changePercent: value.changePercent,
    }));
    return fieldSheet(
      name,
      ["metric", "current", "previous", "changePercent"],
      records,
    );
  }

  /** Seriler tek sayfada yan yana: kova başına bir satır, seri başına kolon. */
  private seriesSheet(
    name: string,
    series: AnalyticsSeries[],
  ): WorkbookDataSheet {
    const buckets = series[0]?.points.map((point) => point.bucket) ?? [];
    const byKey = new Map(
      series.map((entry) => [
        entry.key,
        new Map(entry.points.map((point) => [point.bucket, point.value])),
      ]),
    );

    const records = buckets.map((bucket) => {
      const record: Record<string, ExportCellValue> = { bucket };
      for (const entry of series) {
        record[entry.key] = byKey.get(entry.key)?.get(bucket) ?? 0;
      }
      return record;
    });
    return fieldSheet(
      name,
      ["bucket", ...series.map((entry) => entry.key)],
      records,
    );
  }

  private rowsSheet(
    name: string,
    rows: Array<Record<string, unknown>>,
  ): WorkbookDataSheet {
    // Kolonlar satırların BİRLEŞİMİNDEN alınır: ilk satırda olmayan bir alan
    // (yalnız bazı satırlarda dolan `averageViewUplift` gibi) düşmesin.
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const records = rows.map((row) =>
      Object.fromEntries(
        headers.map((header) => [header, cellOf(row[header])]),
      ),
    );
    return fieldSheet(name, headers, records);
  }
}
