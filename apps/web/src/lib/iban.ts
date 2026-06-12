/**
 * Satıcı IBAN yardımcıları. Backend DTO ile parite:
 * UpsertBankAccountDto @Matches(/^TR\d{24}$/) — boşluksuz, 26 karakter, büyük harf.
 */

/** Boşlukları siler, büyük harfe çevirir — gönderilecek kanonik form. */
export function normalizeIban(raw: string): string {
  return (raw || '').replace(/\s/g, '').toUpperCase();
}

/** Backend regex'i ile birebir: TR + 24 rakam (toplam 26 karakter). */
export function isValidTrIban(raw: string): boolean {
  return /^TR\d{24}$/.test(normalizeIban(raw));
}

/** Girişte gösterim: normalize edip 4'erli bloklara böler. */
export function formatIbanDisplay(raw: string): string {
  const normalized = normalizeIban(raw);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}
