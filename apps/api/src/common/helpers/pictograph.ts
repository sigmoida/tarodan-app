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
 * Emoji, pictographs and the emoji parts Extended_Pictographic leaves out:
 * regional indicators (flags), skin-tone modifiers, the keycap mark, and the
 * joiners that only exist to compose emoji (variation selector 16, ZWJ).
 */
const PICTOGRAPH_SOURCE = `(?![${LEGAL_MARKS}])\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\p{Emoji_Modifier}|\\u20E3|\\uFE0F|\\u200D`;

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

/**
 * Text-style symbols and arrows the catalog gate also rejects: stars, check
 * and cross marks, the Unicode Arrows block and ASCII arrows. A navigation
 * path is written "Profile > Addresses", a pairing in words. Test it against
 * visible text, not markup (an HTML comment ends in "-->").
 */
export const DECORATIVE_GLYPH =
  /[\u2605\u2606\u2713\u2714\u2715\u2717\u2190-\u21FF]|->|<-|=>/u;
