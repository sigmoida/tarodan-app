import { Injectable } from "@nestjs/common";
import type { Locale } from "@tarodan/i18n";
import type {
  ExportCatalog,
  ExportCatalogKey,
  ExportColumnType,
} from "@tarodan/types";

import { AdminAuditService } from "../../modules/admin/ops/admin-audit.service";
import { translateMessage } from "../../modules/i18n/translate";
import { ADMIN_LIST_MAX_LIMIT, type SortDirection } from "../list";
import { exportFilename, type ExportFile } from "./export-file";
import {
  buildExportWorkbook,
  catalogColumns,
  type ExportCellValue,
  type ExportRecord,
  type Translate,
  type WorkbookAppendixSheet,
  type WorkbookDataSheet,
  type WorkbookSummaryRow,
} from "./xlsx-workbook";

/** Tek dökümün kayıt tavanı; aşılırsa dosya ilk N kaydı taşır ve başlık söyler. */
export const EXPORT_ROW_CAP = 20_000;

/** Sayfa boyu — listenin izin verdiği en büyük sayfa (aynı sorgu, aynı sınır). */
export const EXPORT_PAGE_SIZE = ADMIN_LIST_MAX_LIMIT;

/** `fetchPage`'e verilen sayfa: sayfa numarası VE skip/take — liste hangisini kullanıyorsa. */
export interface ExportPageRequest {
  /** 1'den başlar. */
  page: number;
  skip: number;
  take: number;
}

/** Özet sayfasındaki bir satır (filtre, toplam). Boş değerli satır yazılmaz. */
export interface ExportSummaryEntry {
  labelKey: string;
  value: ExportCellValue;
  /** Değerin kendisi bir katalog anahtarı (durum etiketi gibi). */
  valueKey?: string;
  type?: ExportColumnType;
  /**
   * Değer kişisel bir arama terimi (ad, e-posta, kimlik no): dosyaya da
   * denetime de TERİM değil, yalnız uygulandığı ve uzunluğu yazılır.
   */
  redacted?: boolean;
}

export interface ExportAudit {
  actorId: string;
  /** `consent_records_export` gibi; doküman: docs/ADMIN_EXPORTS.md. */
  action: string;
  entityType: string;
  /** Varsayılan "export"; dönemli dökümde dönem. */
  entityId?: string;
  /**
   * Listenin sorgusu. `search` ve `redact` anahtarları TERİM olarak yazılmaz
   * (`<anahtar>Applied` + uzunluk); sayfalama alanları atılır.
   */
  query: object;
  redact?: readonly string[];
}

interface ExportBase {
  locale: Locale;
  /** ASCII dosya adı kökü; tarih eki eklenir. */
  slug: string;
  titleKey: string;
  titleValues?: Record<string, string | number>;
  /** Veri sayfasının adı; verilmezse başlık. */
  sheetNameKey?: string;
  filters?: readonly ExportSummaryEntry[];
  /** Listenin sıralaması — Özet'e yazılır. */
  sort?: { sortBy?: string; sortOrder?: SortDirection };
  /** `masked` kolonları açık yaz — YALNIZ ucun `@Roles`'u bunu zaten taşıyorsa. */
  unmask?: boolean;
  /** Veri sayfalarından sonra gelen sözleşmeli sayfalar. */
  appendix?: (
    t: Translate,
    result: { rowCount: number; truncatedAt: number | null },
  ) => readonly WorkbookAppendixSheet[];
  audit: ExportAudit;
}

export interface ExportListOptions<
  TRow,
  TCatalog extends ExportCatalog,
> extends ExportBase {
  catalog: TCatalog;
  /** Listeyle AYNI where/orderBy; yalnız sayfa değişir. */
  fetchPage: (page: ExportPageRequest) => Promise<readonly TRow[]>;
  /**
   * Kayıt → satır(lar). Uzun biçimde (iç içe kalemler) bir kayıt birden çok
   * satır döner; üst kaydın kolonları her satırda tekrarlanır.
   */
  map: (
    row: TRow,
    t: Translate,
  ) =>
    | ExportRecord<ExportCatalogKey<TCatalog>>
    | readonly ExportRecord<ExportCatalogKey<TCatalog>>[];
  /** Uzun biçim: Özet satır sayısını ve "toplamayın" notunu yazar. */
  longFormat?: boolean;
  /** Üst kayıt toplamları (Özet'te); veri sayfasında toplanmaz. */
  totals?: (rows: readonly TRow[]) => readonly ExportSummaryEntry[];
  cap?: number;
  pageSize?: number;
}

/** Liste olmayan döküm (analitik): sayfalar hazır, yalnız kitap + denetim. */
export interface ExportSheetsOptions extends ExportBase {
  sheets: (t: Translate) => readonly WorkbookDataSheet[];
  rowCount: number;
}

/**
 * Admin dökümlerinin TEK hattı: listeyle aynı sorguyu sayfa sayfa okur, tavanda
 * durur, kitabı yazar, ZORUNLU denetim kaydı bırakır ve dosyayı döner. Yanıt
 * başlıkları `export-response.ts`'te — burası HTTP bilmez.
 *
 * Denetim fail-closed: kayıt yazılamazsa dosya da dönmez. Arama terimi asla
 * yazılmaz (kişisel veri olabilir); yalnız uygulandığı ve uzunluğu.
 */
@Injectable()
export class ExportListService {
  constructor(private readonly audit: AdminAuditService) {}

  async exportList<TRow, TCatalog extends ExportCatalog>(
    options: ExportListOptions<TRow, TCatalog>,
  ): Promise<ExportFile> {
    const cap = options.cap ?? EXPORT_ROW_CAP;
    const collected = await collectRows(
      options.fetchPage,
      cap,
      options.pageSize ?? EXPORT_PAGE_SIZE,
    );
    const truncatedAt = collected.length > cap ? cap : null;
    const rows = truncatedAt === null ? collected : collected.slice(0, cap);

    const t = translator(options.locale);
    const records = rows.flatMap((row): ExportRecord[] => {
      const mapped = options.map(row, t);
      return isRecordList(mapped) ? [...mapped] : [mapped];
    });

    return this.finish(options, t, {
      sheets: [
        {
          name: t(options.sheetNameKey ?? options.titleKey, options.titleValues),
          columns: catalogColumns(options.catalog.columns, t),
          records,
        },
      ],
      rowCount: rows.length,
      lineCount: options.longFormat ? records.length : undefined,
      totals: options.totals?.(rows) ?? [],
      truncatedAt,
      resource: options.catalog.resource,
    });
  }

  async exportSheets(options: ExportSheetsOptions): Promise<ExportFile> {
    const t = translator(options.locale);
    return this.finish(options, t, {
      sheets: options.sheets(t),
      rowCount: options.rowCount,
      totals: [],
      truncatedAt: null,
      resource: options.slug,
    });
  }

  private async finish(
    base: ExportBase,
    t: Translate,
    content: {
      sheets: readonly WorkbookDataSheet[];
      rowCount: number;
      lineCount?: number;
      totals: readonly ExportSummaryEntry[];
      truncatedAt: number | null;
      resource: string;
    },
  ): Promise<ExportFile> {
    const generatedAt = new Date();
    const notes = [
      ...(content.truncatedAt !== null
        ? [t("server.export.summary.truncated", { count: content.truncatedAt })]
        : []),
      ...(content.lineCount !== undefined
        ? [t("server.export.summary.longFormat")]
        : []),
    ];

    const body = await buildExportWorkbook({
      summary: {
        title: t(base.titleKey, base.titleValues),
        generatedAt,
        filters: summaryFilters(base, t),
        rowCount: content.rowCount,
        lineCount: content.lineCount,
        totals: renderEntries(content.totals, t),
        notes,
      },
      sheets: content.sheets,
      appendix: base.appendix?.(t, {
        rowCount: content.rowCount,
        truncatedAt: content.truncatedAt,
      }),
      t,
      unmask: base.unmask ?? false,
    });

    // Dosya hazır; denetim yazılamazsa hiçbir şey dönmez (fail-closed).
    await this.audit.createRequiredAuditLog(
      base.audit.actorId,
      base.audit.action,
      base.audit.entityType,
      base.audit.entityId ?? "export",
      null,
      {
        resource: content.resource,
        filters: auditFilters(base.audit),
        rowCount: content.rowCount,
        ...(content.lineCount !== undefined
          ? { lineCount: content.lineCount }
          : {}),
        truncated: content.truncatedAt !== null,
        truncatedAt: content.truncatedAt,
      },
    );

    return {
      filename: exportFilename(base.slug, generatedAt),
      body,
      rowCount: content.rowCount,
      truncatedAt: content.truncatedAt,
    };
  }
}

/**
 * Sayfaları tavan + 1 kayda ulaşana ya da liste bitene dek okur. Bir fazlası,
 * tavan TAM dolduğunda "daha var mı" sorusunun cevabıdır — sessiz kırpma yok.
 */
export async function collectRows<TRow>(
  fetchPage: (page: ExportPageRequest) => Promise<readonly TRow[]>,
  cap: number,
  pageSize: number,
): Promise<TRow[]> {
  const rows: TRow[] = [];
  for (let page = 1; rows.length <= cap; page++) {
    const batch = await fetchPage({
      page,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Sayfalama alanları denetime yazılmaz — dosyanın içeriğini değiştirmezler. */
const NON_FILTER_KEYS = new Set(["page", "limit"]);

/**
 * Denetime yazılan filtreler. `search` ve `redact` anahtarlarının DEĞERİ
 * yazılmaz: `audit_logs` hiç purge edilmez, arama terimi (TCKN, e-posta, ad)
 * oraya kopyalanırsa kişisel verinin ikinci kalıcı deposu olur.
 */
export function auditFilters(audit: ExportAudit): Record<string, unknown> {
  const redacted = new Set(["search", ...(audit.redact ?? [])]);
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(audit.query)) {
    if (NON_FILTER_KEYS.has(key) || value === undefined) continue;
    if (redacted.has(key)) continue;
    filters[key] = value;
  }
  const query = audit.query as Record<string, unknown>;
  for (const key of redacted) {
    const raw = query[key];
    const term = typeof raw === "string" ? raw.trim() : "";
    filters[`${key}Applied`] = term.length > 0;
    filters[`${key}Length`] = term.length;
  }
  return filters;
}

function summaryFilters(base: ExportBase, t: Translate): WorkbookSummaryRow[] {
  const query = base.audit.query as Record<string, unknown>;
  const search = typeof query.search === "string" ? query.search : undefined;
  const entries: ExportSummaryEntry[] = [
    ...(base.filters ?? []),
    {
      labelKey: "server.export.summary.search",
      value: search,
      redacted: true,
    },
  ];
  const rows = renderEntries(entries, t);
  if (base.sort?.sortBy) {
    // `resolveOrderBy` yönsüz sıralamayı azalan yorumlar; Özet de öyle yazar.
    rows.push({
      label: t("server.export.summary.sort"),
      value: `${base.sort.sortBy} (${t(
        base.sort.sortOrder === "asc" ? "common.asc" : "common.desc",
      )})`,
    });
  }
  return rows;
}

function renderEntries(
  entries: readonly ExportSummaryEntry[],
  t: Translate,
): WorkbookSummaryRow[] {
  return entries.flatMap((entry) => {
    const { value } = entry;
    if (value === null || value === undefined) return [];
    if (typeof value === "string" && value.trim() === "") return [];
    const label = t(entry.labelKey);
    if (entry.redacted) {
      return [
        {
          label,
          value: t("server.export.summary.searchApplied", {
            length: String(value).trim().length,
          }),
        },
      ];
    }
    return [
      {
        label,
        value: entry.valueKey ? t(entry.valueKey) : value,
        type: entry.type,
      },
    ];
  });
}

function translator(locale: Locale): Translate {
  return (key, values) => translateMessage(key, locale, values);
}

function isRecordList<R>(value: R | readonly R[]): value is readonly R[] {
  return Array.isArray(value);
}
