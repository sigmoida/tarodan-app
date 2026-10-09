/** @format */

/** İlk satır içi afiş 8. kartın ardından gelir. */
export const INLINE_AD_FIRST_AFTER = 8;
/** Sonrakiler her 16 kartta bir… */
export const INLINE_AD_EVERY = 16;
/** …ve ilkine ek olarak en çok bu kadar tekrar edilir. */
export const INLINE_AD_MAX_REPEATS = 1;

/**
 * Bu kartın (0 tabanlı sıra) hemen ardına satır içi afiş girer mi? Döndürülen
 * sayı yuvanın sırası (0 = ilk) — yuva anahtarına girer ki her yuva farklı
 * afiş seçebilsin. Girmezse `null`.
 */
export function inlineAdSlotAfter(cardIndex: number): number | null {
  const cardNumber = cardIndex + 1;
  if (cardNumber < INLINE_AD_FIRST_AFTER) return null;
  const offset = cardNumber - INLINE_AD_FIRST_AFTER;
  if (offset % INLINE_AD_EVERY !== 0) return null;
  const slot = offset / INLINE_AD_EVERY;
  return slot <= INLINE_AD_MAX_REPEATS ? slot : null;
}
