/** @format */

/** Satır içi afiş 8. kartın ardından gelir — listede TEK kez. */
export const INLINE_AD_AFTER = 8;

/**
 * Bu kartın (0 tabanlı sıra) hemen ardına satır içi afiş girer mi? Liste
 * başına en fazla bir afiş: API de yuva başına tek reklam döner, ikinci bir
 * yuva aynı afişi tekrarlardı.
 */
export function isInlineAdSlotAfter(cardIndex: number): boolean {
  return cardIndex + 1 === INLINE_AD_AFTER;
}
