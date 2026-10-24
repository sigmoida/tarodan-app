/**
 * Window width classes (px / pt) and content widths for large screens: iPad,
 * the foldable iPhone, Android tablets and foldables. The classes match the
 * Material window size classes; a class starts at its value here:
 *
 * - `compact`: < `medium` (every phone, the foldable iPhone's outer display)
 * - `medium`: 600 to 839 (foldable iPhone inner display, iPad Air 11" portrait)
 * - `expanded`: 840 to 1199 (iPad 13" portrait, small tablets in landscape)
 * - `large`: >= 1200 (Android tablets in landscape)
 *
 * Mobile compares them with a measured width (`useWindowDimensions`,
 * `onLayout`), never with the device model, so Split View, Stage Manager,
 * folding and resizable Android windows work alike. Web keeps its Tailwind
 * `screens` (`tailwind-preset.ts`) for CSS media queries; these classes are the
 * app's window classes, not a second set of web breakpoints.
 */
export const breakpoints = {
  medium: 600,
  expanded: 840,
  large: 1200,
} as const;

export type Breakpoints = typeof breakpoints;

/** Content widths (px / pt) that large screens centre content at. */
export const contentWidths = {
  /** Forms, settings and detail pages (web `max-w-2xl`, 42rem). */
  readable: 672,
} as const;

export type ContentWidths = typeof contentWidths;
