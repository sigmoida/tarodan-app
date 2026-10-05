/**
 * Sunucunun ürettiği Excel dökümlerinin (İptaller, Onay Kayıtları, …) ortak
 * yanıt okuması. Toolbar'ın CSV düğmesi yalnız yüklü sayfayı aktarır; bu
 * dökümler geçerli filtrenin tamamını sunucudan alır ve bir satır tavanı
 * taşır — tavan aşıldıysa API bunu başlıkla söyler, panel kullanıcıyı uyarır.
 */

/** API'nin "dosya ilk N satırla kırpıldı" başlığı (küçük harf: axios normalize eder). */
export const EXPORT_TRUNCATED_HEADER = "x-export-truncated-at";

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
