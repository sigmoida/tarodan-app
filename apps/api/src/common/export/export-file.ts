import { trCalendarDate } from "../helpers/tr-calendar";

/** Bir dökümün çıktısı — yanıt başlıkları (`export-response.ts`) bundan yazılır. */
export interface ExportFile {
  filename: string;
  body: Buffer;
  /** Dosyadaki KAYIT sayısı (liste satırı; uzun biçimde üst kayıt). */
  rowCount: number;
  /** Tavan aşıldıysa tavan (dosya ilk N kaydı taşır), aşılmadıysa null. */
  truncatedAt: number | null;
}

/**
 * Dosya adı: `<slug>-<yyyy-mm-dd>.xlsx`, tarih Türkiye takviminde. Slug ASCII
 * tutulur (Türkçe karakter yok) — başlıkta `filename*` gerekmeden her tarayıcı
 * aynı adı görür.
 */
export function exportFilename(slug: string, at: Date): string {
  return `${slug}-${trCalendarDate(at)}.xlsx`;
}
