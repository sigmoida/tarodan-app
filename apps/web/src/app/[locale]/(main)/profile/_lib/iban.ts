/**
 * Satıcı IBAN yardımcıları. Backend DTO ile parite:
 * UpsertBankAccountDto @Matches(/^TR\d{24}$/) — boşluksuz, 26 karakter, büyük harf.
 */

/** Boşlukları siler, büyük harfe çevirir — gönderilecek kanonik form. */
export function normalizeIban(raw: string): string {
  return (raw || "").replace(/\s/g, "").toUpperCase();
}

/** IBAN ISO 7064 mod-97 kontrolü: ilk 4 karakter sona alınır, harfler sayıya çevrilir, %97===1 olmalı. */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  );
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/**
 * Backend regex'i (TR + 24 rakam) + ISO mod-97 kontrol hanesi doğrulaması.
 * Format doğru ama kontrol hanesi tutmuyorsa (typo) reddeder.
 */
export function isValidTrIban(raw: string): boolean {
  const normalized = normalizeIban(raw);
  if (!/^TR\d{24}$/.test(normalized)) return false;
  return ibanMod97(normalized) === 1;
}

/** Girişte gösterim: normalize edip 4'erli bloklara böler. */
export function formatIbanDisplay(raw: string): string {
  const normalized = normalizeIban(raw);
  return normalized.replace(/(.{4})/g, "$1 ").trim();
}
