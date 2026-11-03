/** A box ratio, `width : height` as two integers (e.g. 16 and 10). */
export interface MediaRatio {
  readonly width: number;
  readonly height: number;
}

/**
 * Media box ratios: the fixed shape a media box has, whatever image fills it.
 * Two integers let every consumer both show a ratio ("16:10") and compute
 * with it (`width / height`, the CSS and React Native `aspectRatio`
 * convention). Images fill the box with `cover`, centred, so an image of
 * another ratio is cropped, never letterboxed.
 *
 * Consumers:
 * - Web and admin: Tailwind utilities from `tailwind-preset.ts`
 *   (`aspect-hero-compact`, `aspect-hero-split`).
 * - Mobile: `src/theme/media.ts` is a synced copy; layout code derives its
 *   numbers as `width / height`.
 * - Admin hero form: upload guidance and the crop warning read the same
 *   values, so what the admin is told matches what every screen shows.
 */
export const mediaRatios = {
  /**
   * Home hero image box on phones: web below `md` (768 px), mobile window
   * class `compact`. The image sits above the text.
   */
  heroCompact: { width: 16, height: 10 },
  /**
   * Home hero image box beside the text: web from `md`, mobile from window
   * class `medium`.
   */
  heroSplit: { width: 4, height: 3 },
} as const satisfies Record<string, MediaRatio>;

export type MediaRatios = typeof mediaRatios;
export type MediaRatioName = keyof MediaRatios;
