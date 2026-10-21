/**
 * User-facing text carries no emoji or pictographs: visual cues come from
 * design-system icons on the client, not from characters in the copy. The
 * catalog gate (`packages/i18n/scripts/check-catalog.mjs`) applies the same
 * rule to i18n values; this is the API-side definition for server-rendered
 * text (stored notification titles, emails, PDFs) and its specs.
 *
 * Extended_Pictographic also matches the legal marks (c), (r) and (tm); they
 * are typography, not pictographs, so they stay allowed (the email footer
 * prints the copyright line).
 */
const LEGAL_MARKS = "©®™";

/**
 * Emoji, pictographs and the joiners that only exist to compose them
 * (variation selector 16, zero-width joiner).
 */
const PICTOGRAPH_SOURCE = `(?![${LEGAL_MARKS}])\\p{Extended_Pictographic}|[\\uFE0F\\u200D]`;

/** Tests whether a text holds a pictograph (non-global, safe to reuse). */
export const PICTOGRAPH = new RegExp(PICTOGRAPH_SOURCE, "u");

/**
 * Removes pictographs and collapses the whitespace they leave behind
 * ("Takas Kabul Edildi! 🎉" -> "Takas Kabul Edildi!"). Used on rows stored
 * before the copy was cleaned, so old notifications read like new ones.
 */
export function stripPictographs(text: string): string {
  if (!PICTOGRAPH.test(text)) return text;
  return text
    .replace(new RegExp(PICTOGRAPH_SOURCE, "gu"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
