import { mediaRatios, type MediaRatio } from "@tarodan/design-tokens";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Hero image guidance for the admin form. The ratios come from the shared
 * media tokens, so what the admin is told matches what every screen shows.
 */

/**
 * Recommended upload width in px. Admin-only: covers the 560 px desktop box
 * at 2x and a 430 pt phone at 3x, and stays below the 2400 px server cap.
 */
export const HERO_IMAGE_WIDTH = 1600;

/** Crop share per side (percent) above which the form warns. */
export const CROP_WARN_PERCENT = 3;

export interface ImageSpec {
  ratio: MediaRatio;
  /** `"16:10"` style label. */
  ratioLabel: string;
  width: number;
  height: number;
}

const specFor = (ratio: MediaRatio): ImageSpec => ({
  ratio,
  ratioLabel: `${ratio.width}:${ratio.height}`,
  width: HERO_IMAGE_WIDTH,
  height: Math.round((HERO_IMAGE_WIDTH * ratio.height) / ratio.width),
});

/** Desktop and tablet image: 4:3, 1600 x 1200. */
export const DESKTOP_IMAGE_SPEC = specFor(mediaRatios.heroSplit);

/** Phone image: 16:10, 1600 x 1000. */
export const MOBILE_IMAGE_SPEC = specFor(mediaRatios.heroCompact);

const ratioValue = (r: MediaRatio) => r.width / r.height;

/**
 * Share of an image lost on each of the two cropped sides, in percent
 * (0 to 50), when it fills a box with `object-fit: cover`, centred. Both
 * arguments are `width / height`. An image of the box's ratio loses nothing.
 */
export function cropLoss(imageRatio: number, boxRatio: number): number {
  if (!(imageRatio > 0) || !(boxRatio > 0)) return 0;
  const visible =
    imageRatio > boxRatio ? boxRatio / imageRatio : imageRatio / boxRatio;
  return ((1 - visible) / 2) * 100;
}

/** Per-side crop percent of an image of the given natural size in a box. */
export function cropLossFor(
  naturalWidth: number,
  naturalHeight: number,
  box: MediaRatio,
): number {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return 0;
  return cropLoss(naturalWidth / naturalHeight, ratioValue(box));
}

/** Translated "recommended ratio and size" line for an upload field. */
export function imageHint(t: T, spec: ImageSpec): string {
  return t("admin.marketing.hero.imageSpecHint", {
    ratio: spec.ratioLabel,
    width: spec.width,
    height: spec.height,
  });
}
