import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import containerQueries from "@tailwindcss/container-queries";
import {
  colors,
  containers,
  mediaRatios,
  radius,
  spacing,
  shadows,
  motion,
  typography,
  zIndex,
  type MediaRatio,
} from "./index";

/**
 * Tarodan Design System — Shared Tailwind Preset (web adapter)
 *
 * The single source of truth for every design decision is this package's raw
 * tokens (colors, radius, spacing, typography, shadows, motion). This preset
 * is the web adapter that projects those tokens onto a Tailwind theme.
 *
 * Consumed by apps/web and apps/admin via `@tarodan/design-tokens/tailwind`.
 * Apps should NOT re-declare tokens (colors/radius/spacing) in their own
 * tailwind.config — only truly app-specific bits (content globs, one-off
 * animations) belong there.
 */

/** Numeric px tokens → Tailwind length strings (radius stays in px). */
const toPx = (obj: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `${v}px`]));

/**
 * Numeric px tokens → rem (web keeps rem so spacing scales with the user's
 * root font-size; the native adapter keeps the same values as raw px).
 */
const toRem = (obj: Record<string, number>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === 0 ? "0px" : `${v / 16}rem`]),
  );

/** A `MediaRatio` token as a CSS `aspect-ratio` value ("16 / 10"). */
const toAspectRatio = ({ width, height }: MediaRatio): string =>
  `${width} / ${height}`;

/**
 * Safe area helpers.
 *
 * On screens with a notch and rounded corners the system uses the screen
 * edges: the status bar at the top, the home indicator at the bottom, and in
 * LANDSCAPE the notch on the left or right. Content under those strips is cut
 * off or cannot be tapped. `env(safe-area-inset-*)` gives the thickness of the
 * strip on each edge.
 *
 * `env()` is non-zero ONLY when the document is served with
 * `viewport-fit=cover` (apps/web: `viewport.viewportFit` in `app/layout.tsx`).
 * Without it these helpers add zero, so the layout stays as it is; they are
 * safe to use anywhere.
 *
 * CAUTION: `p*-safe` does not ADD padding, it SETS it. If the same edge already
 * has a `p-4`, one overrides the other (both are plain classes, so the order
 * decides). To add the safe area to existing padding, use a combined helper
 * such as `px-gutter` or write the value out:
 * `pb-[calc(1rem+env(safe-area-inset-bottom))]`.
 */
const safeAreaPlugin = plugin(({ addUtilities }) => {
  addUtilities({
    ".pt-safe": { paddingTop: "env(safe-area-inset-top)" },
    ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom)" },
    ".pl-safe": { paddingLeft: "env(safe-area-inset-left)" },
    ".pr-safe": { paddingRight: "env(safe-area-inset-right)" },
    ".px-safe": {
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    },
    /**
     * Page gutter. It does two things:
     *
     * 1. It scales with the screen: `clamp` gives 1rem on phones and opens up
     *    to 2rem as the screen grows. A fixed 1rem left content stuck to the
     *    edge on wide screens.
     * 2. When the landscape notch is wider than this value, the gutter matches
     *    it, so text never slides under the notch in landscape.
     */
    ".px-gutter": {
      paddingLeft: "max(clamp(1rem, 2vw, 2rem), env(safe-area-inset-left))",
      paddingRight: "max(clamp(1rem, 2vw, 2rem), env(safe-area-inset-right))",
    },
  });
});

const tarodanPreset: Partial<Config> = {
  // Container queries: a fluid component (the listing card) changes its
  // presentation by its OWN width, which depends on each route's column
  // count, not on the viewport. Mark the component root `@container` and
  // write `@card-wide:...`. The root's width must come from outside (a grid
  // cell or a sized wrapper): an inline-size container never grows to fit
  // its content.
  plugins: [safeAreaPlugin, containerQueries],
  theme: {
    /**
     * Breakpoints: Tailwind's default list with `xs` added in front.
     *
     * By default the first step is `sm` (640px), so a 360px phone and a 600px
     * tablet got the SAME styles: two-column form rows were cramped on narrow
     * phones, and once they were made one column, the screens in between stayed
     * one column for no reason. `xs` closes that gap.
     *
     * The 400px edge was chosen by device: common narrow phones (375 iPhone SE,
     * 390 iPhone 14, 360 Android) stay BELOW it, one column there; wide phones
     * (412 Galaxy, 430 iPhone Pro Max) are above it, two columns there. The
     * caller writes `xs:` for whichever side is right.
     *
     * A full list, NOT `extend`: `extend.screens` would append the new step at
     * the end of the list, and the `xs:` rules would be emitted AFTER `sm:` in
     * the CSS and override them.
     */
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        primary: colors.primary,
        danger: colors.danger,
        success: colors.success,
        info: colors.info,
        warning: colors.warning,
        border: {
          DEFAULT: colors.border.DEFAULT,
          strong: colors.border.strong,
          subtle: colors.border.subtle,
        },
        heading: colors.text.heading,
        body: colors.text.body,
        muted: colors.text.muted,
        subtle: colors.text.subtle,
        surface: {
          DEFAULT: colors.surface.DEFAULT,
          alt: colors.surface.alt,
          elevated: colors.surface.elevated,
        },
      },
      textColor: {
        heading: colors.text.heading,
        body: colors.text.body,
        muted: colors.text.muted,
        subtle: colors.text.subtle,
        inverted: colors.text.inverted,
      },
      borderColor: {
        border: colors.border.DEFAULT,
        "border-strong": colors.border.strong,
        "border-subtle": colors.border.subtle,
      },
      backgroundColor: {
        surface: colors.surface.DEFAULT,
        "surface-alt": colors.surface.alt,
        "surface-elevated": colors.surface.elevated,
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
        display: [...typography.fontFamily.display],
      },
      // Only the sub-`xs` caption token is projected here; `xs`/`sm`/`base`/…
      // keep Tailwind's defaults (same px values, with their tuned line-heights).
      // This adds `text-2xs` (10px) so dense labels/badges stop hand-rolling
      // arbitrary `text-[10px]` sizes.
      fontSize: {
        "2xs": `${typography.fontSize["2xs"] / 16}rem`,
      },
      // Named container sizes from `containers.ts` (rem, like spacing).
      containers: {
        "card-wide": `${containers.cardWide / 16}rem`,
      },
      // Media box ratios from `media.ts`. `extend` keeps Tailwind's own
      // `aspect-auto`, `aspect-square` and `aspect-video`.
      aspectRatio: {
        "hero-compact": toAspectRatio(mediaRatios.heroCompact),
        "hero-split": toAspectRatio(mediaRatios.heroSplit),
      },
      borderRadius: toPx(radius),
      spacing: toRem(spacing),
      boxShadow: shadows,
      transitionTimingFunction: motion.easing,
      animation: motion.animation,
      keyframes: motion.keyframes,
      zIndex: {
        "navigation-overlay": String(zIndex.navigationOverlay),
        navigation: String(zIndex.navigation),
        overlay: String(zIndex.overlay),
        modal: String(zIndex.modal),
        popover: String(zIndex.popover),
        toast: String(zIndex.toast),
      },
    },
  },
};

export default tarodanPreset;
