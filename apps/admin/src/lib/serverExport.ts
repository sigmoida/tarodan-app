import { extractErrorMessage } from "@/lib/error";

/**
 * Sunucunun ürettiği Excel dökümlerinin ortak yanıt okuması. Her döküm, ekrandaki
 * listenin (filtre + arama + sıralama) TAMAMIDIR ve bir satır tavanı taşır —
 * tavan aşıldıysa API bunu başlıkla söyler, panel kullanıcıyı uyarır. Akışın
 * kendisi `hooks/useListExport`ta; burada yalnız saf okuma/karar parçaları var.
 */

export const EXPORT_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** API'nin "dosya ilk N satırla kırpıldı" başlığı (küçük harf: axios normalize eder). */
export const EXPORT_TRUNCATED_HEADER = "x-export-truncated-at";

/** API'nin döküm satır sayısı başlığı. */
export const EXPORT_ROW_COUNT_HEADER = "x-export-row-count";

type Headers = Record<string, unknown> | undefined;

/** Sunucunun `Content-Disposition` adı; yoksa verilen sabit ad. */
export function exportFilename(headers: Headers, fallback: string): string {
  const disposition = String(headers?.["content-disposition"] ?? "");
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallback;
}

/** Dosya kırpıldıysa tavan (satır sayısı), değilse null. */
export function exportTruncatedAt(headers: Headers): number | null {
  const value = Number(headers?.[EXPORT_TRUNCATED_HEADER]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Liste sıralamasının döküm parametreleri — tablo sıralı değilse API
 * varsayılan sırasını (yeni → eski) kullanır.
 */
export function exportSortParams(sort: {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  sortType?: string;
}): Record<string, string> {
  if (!sort.sortBy) return {};
  return {
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder ?? "asc",
    ...(sort.sortType ? { sortType: sort.sortType } : {}),
  };
}

/** Dökümdeki veri satırı sayısı (başlık yoksa ya da geçersizse null). */
export function exportRowCount(headers: Headers): number | null {
  const raw = headers?.[EXPORT_ROW_COUNT_HEADER];
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Bir döküm yanıtından indirmek ve bildirmek için gereken her şey. */
export interface ExportFile {
  filename: string;
  data: BlobPart;
  rowCount: number | null;
  truncatedAt: number | null;
}

export function readExportResponse(
  response: { data: unknown; headers?: Headers },
  fallbackFilename: string,
): ExportFile {
  return {
    filename: exportFilename(response.headers, fallbackFilename),
    data: response.data as BlobPart,
    rowCount: exportRowCount(response.headers),
    truncatedAt: exportTruncatedAt(response.headers),
  };
}

/** İndirme sonrası kullanıcıya söylenecek tek şey: kırpıldı mı, kaç satır. */
export type ExportNotice =
  | { kind: "truncated"; count: number }
  | { kind: "success"; count: number | null };

export function exportNotice(file: ExportFile): ExportNotice {
  return file.truncatedAt
    ? { kind: "truncated", count: file.truncatedAt }
    : { kind: "success", count: file.rowCount };
}

/**
 * Döküm uçları `responseType: "blob"` ile çağrılır; hata gövdesi de Blob gelir.
 * JSON'a çevrilip sunucunun mesajı çıkarılır, okunamazsa `fallback` döner.
 */
export async function exportErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const body: unknown = JSON.parse(await data.text());
      return extractErrorMessage({ response: { data: body } }, fallback);
    } catch {
      return fallback;
    }
  }
  return extractErrorMessage(error, fallback);
}
