import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENTS,
  type ConsentDocumentKey,
  type PendingConsent,
} from "@tarodan/types";

/** Bir üyenin bir belgeye ait kayıt satırı (yeniden-onay hesabı için gereken kadarı). */
export interface ConsentHistoryRow {
  document: string;
  version: string;
  action: "granted" | "withdrawn";
  createdAt: Date;
}

/**
 * Belge başına EN SON satır. Belgenin güncel durumu en son satırdır (tablo
 * ekleme-yalnız; geri çekme de yeni satırdır), bu yüzden sıra createdAt'ten
 * gelir — veritabanının döndürdüğü sıraya güvenilmez.
 */
export function latestByDocument<T extends ConsentHistoryRow>(
  rows: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.document);
    if (!current || row.createdAt.getTime() > current.createdAt.getTime()) {
      latest.set(row.document, row);
    }
  }
  return latest;
}

/**
 * Üyenin onaylaması gereken belgeler — yeniden-onay kapısının TEK kuralı.
 *
 * Zorunlu bir belge şu durumlarda bekler:
 *   - hiç kaydı yoksa (`missing`): bu tablodan önce açılmış hesaplar, sosyal
 *     girişle açılan hesaplar, onay göndermeyen eski mobil sürümle kayıt;
 *   - en son kaydı yürürlükteki sürüm DEĞİLSE (`outdated`): metin güncellendi;
 *   - en son kaydı geri çekmeyse (`missing`): onay artık geçerli değil.
 *
 * Sürüm karşılaştırması EŞİTLİKTİR, sıralama değil: "yürürlükteki metin
 * kabul edildi mi" sorusunun cevabı yalnız aynı sürümle evettir.
 */
export function computePendingConsents(
  rows: readonly ConsentHistoryRow[],
  required: readonly ConsentDocumentKey[] = ACCOUNT_REQUIRED_CONSENTS,
): PendingConsent[] {
  const latest = latestByDocument(rows);
  const pending: PendingConsent[] = [];
  for (const document of required) {
    const { version, path } = CONSENT_DOCUMENTS[document];
    const row = latest.get(document);
    if (row?.action === "granted" && row.version === version) continue;
    pending.push({
      document,
      version,
      path,
      reason: row?.action === "granted" ? "outdated" : "missing",
    });
  }
  return pending;
}
