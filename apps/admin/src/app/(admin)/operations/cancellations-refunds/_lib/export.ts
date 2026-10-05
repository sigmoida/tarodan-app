import type {
  AdminCancellationBucket,
  AdminCancellationTab,
} from "@tarodan/types";
import {
  EXPORT_TRUNCATED_HEADER,
  exportFilename as serverExportFilename,
  exportTruncatedAt,
} from "@/lib/serverExport";

/**
 * Excel dışa aktarımının saf parçaları: istek parametreleri ve yanıt
 * başlıklarının okunması. Sıralama yalnız iptal anına göredir (API başka
 * anahtar tanımaz); tablo sıralaması kapalıysa API varsayılanı (yeni → eski).
 */

export const CANCELLATION_EXPORT_TRUNCATED_HEADER = EXPORT_TRUNCATED_HEADER;

const FALLBACK_FILENAME = "iptaller.xlsx";

export function exportParams({
  tab,
  bucket,
  filters,
  sort,
}: {
  tab: AdminCancellationTab;
  bucket: AdminCancellationBucket;
  filters: Record<string, string>;
  sort: { sortBy?: string; sortOrder?: "asc" | "desc" };
}): Record<string, string> {
  return {
    ...filters,
    tab,
    bucket,
    ...(sort.sortBy ? { sortOrder: sort.sortOrder ?? "asc" } : {}),
  };
}

type Headers = Record<string, unknown> | undefined;

/** Sunucunun `Content-Disposition` adı; yoksa sabit ad. */
export function exportFilename(headers: Headers): string {
  return serverExportFilename(headers, FALLBACK_FILENAME);
}

/** Dosya kırpıldıysa tavan (satır sayısı), değilse null. */
export const isTruncated = exportTruncatedAt;
