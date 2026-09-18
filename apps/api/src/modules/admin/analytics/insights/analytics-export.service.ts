import { Injectable } from "@nestjs/common";
import type {
  AnalyticsExportFormat,
  AnalyticsMetric,
  AnalyticsRangeQuery,
  AnalyticsSeries,
  AnalyticsTab,
} from "@tarodan/types";
import {
  renderSheet,
  toCsv,
  toXlsx,
  type Cell,
  type RenderedSheet,
} from "../../../../common/helpers/tabular-export";
import { AnalyticsCatalogService } from "./analytics-catalog.service";
import { AnalyticsMembershipService } from "./analytics-membership.service";
import { AnalyticsQualityService } from "./analytics-quality.service";
import { AnalyticsSalesService } from "./analytics-sales.service";
import { AnalyticsTradeService } from "./analytics-trade.service";

export interface AnalyticsExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

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

function isSeriesList(value: unknown): value is AnalyticsSeries[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "key" in entry &&
        "points" in entry,
    )
  );
}

function isRowList(value: unknown): value is Array<Record<string, Cell>> {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "object" && entry !== null)
  );
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
 * lazım. Etiketleme ekranın işi.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly sales: AnalyticsSalesService,
    private readonly trade: AnalyticsTradeService,
    private readonly catalog: AnalyticsCatalogService,
    private readonly quality: AnalyticsQualityService,
    private readonly membership: AnalyticsMembershipService,
  ) {}

  async export(
    tab: AnalyticsTab,
    format: AnalyticsExportFormat,
    query: AnalyticsRangeQuery | undefined,
  ): Promise<AnalyticsExportFile> {
    const response = await this.load(tab, query);
    const sheets = this.toSheets(response as Record<string, unknown>);
    const range = (response as { range: { from: string; to: string } }).range;
    const stem = `analitik-${tab}-${range.from.slice(0, 10)}-${range.to.slice(0, 10)}`;

    if (format === "xlsx") {
      return {
        filename: `${stem}.xlsx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: await toXlsx(sheets),
      };
    }

    return {
      filename: `${stem}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: Buffer.from(toCsv(sheets), "utf8"),
    };
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

  private toSheets(response: Record<string, unknown>): RenderedSheet[] {
    const sheets: RenderedSheet[] = [];

    for (const [field, value] of Object.entries(response)) {
      // `range` dosya adında zaten var ve tek satırlık bir sayfa açmaya
      // değmez.
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
  ): RenderedSheet {
    const rows = Object.entries(metrics).map(([key, value]) => ({
      key,
      ...value,
    }));

    return renderSheet(
      name,
      [
        { header: "metric", value: (row) => row.key },
        { header: "current", value: (row) => row.current },
        { header: "previous", value: (row) => row.previous },
        { header: "changePercent", value: (row) => row.changePercent },
      ],
      rows,
    );
  }

  /** Seriler tek sayfada yan yana: kova başına bir satır, seri başına kolon. */
  private seriesSheet(name: string, series: AnalyticsSeries[]): RenderedSheet {
    const buckets = series[0]?.points.map((point) => point.bucket) ?? [];
    const byKey = new Map(
      series.map((entry) => [
        entry.key,
        new Map(entry.points.map((point) => [point.bucket, point.value])),
      ]),
    );

    return renderSheet(
      name,
      [
        { header: "bucket", value: (bucket: string) => bucket },
        ...series.map((entry) => ({
          header: entry.key,
          value: (bucket: string) => byKey.get(entry.key)?.get(bucket) ?? 0,
        })),
      ],
      buckets,
    );
  }

  private rowsSheet(
    name: string,
    rows: Array<Record<string, Cell>>,
  ): RenderedSheet {
    // Kolonlar satırların BİRLEŞİMİNDEN alınır: ilk satırda olmayan bir alan
    // (yalnız bazı satırlarda dolan `averageViewUplift` gibi) düşmesin.
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

    return renderSheet(
      name,
      headers.map((header) => ({ header, value: (row) => row[header] })),
      rows,
    );
  }
}
