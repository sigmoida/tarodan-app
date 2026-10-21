/** @format */

/**
 * How a listing card shows its action: an icon-only `IconButton` on a narrow
 * card, a text `Button` on a wide one. Both are rendered; CSS shows one, so
 * the switch costs no JS and no layout shift.
 *
 * - `fit` (grid cards): by the CARD's width, a container query on the card
 *   root (`@container`, size `card-wide` = 16rem from the design tokens). The
 *   column count is each route's, so the same viewport can give text on a
 *   3-column grid and icons on a 6-column rail.
 * - `list` (the full-width list row): by the viewport, from `xs` (400px) up.
 */
export type CardActionPresentation = "fit" | "list";

export const CARD_ACTION_ICON_CLASS: Record<CardActionPresentation, string> = {
  fit: "@card-wide:hidden",
  list: "xs:hidden",
};

export const CARD_ACTION_TEXT_CLASS: Record<CardActionPresentation, string> = {
  fit: "hidden @card-wide:inline-flex",
  list: "hidden xs:inline-flex",
};
