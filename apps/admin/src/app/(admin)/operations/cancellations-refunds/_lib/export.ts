import type {
  AdminCancellationBucket,
  AdminCancellationTab,
} from "@tarodan/types";

/**
 * Excel dışa aktarımının saf parçaları: istek parametreleri ve yanıt
 * başlıklarının okunması. Sıralama yalnız iptal anına göredir (API başka
 * anahtar tanımaz); tablo sıralaması kapalıysa API varsayılanı (yeni → eski).
 */

export const CANCELLATION_EXPORT_TRUNCATED_HEADER = "x-export-truncated-at";

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
  const disposition = String(headers?.["content-disposition"] ?? "");
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? FALLBACK_FILENAME;
}

/** Dosya kırpıldıysa tavan (satır sayısı), değilse null. */
export function isTruncated(headers: Headers): number | null {
  const value = Number(headers?.[CANCELLATION_EXPORT_TRUNCATED_HEADER]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
