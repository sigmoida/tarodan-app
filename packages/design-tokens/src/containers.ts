/**
 * Component widths (px) at which a component changes its presentation,
 * measured on the component itself, not on the viewport. A fluid component
 * (the listing card) sits in grids whose column count each route sets, so the
 * same viewport gives it very different widths.
 *
 * Web projects these as container query sizes (`@container` with
 * `@card-wide:`, see `tailwind-preset.ts`); mobile compares them with the
 * width it measures (`onLayout`).
 */
export const containers = {
  /**
   * From this card width up, the listing card's action shows its text label
   * ("Sepete Ekle", "Öne Çıkar") beside the price; below it, icon-only.
   */
  cardWide: 256,
} as const;

export type Containers = typeof containers;
