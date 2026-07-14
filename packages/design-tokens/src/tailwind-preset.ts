import type { Config } from "tailwindcss";
import { colors, radius, spacing, shadows, motion, typography } from "./index";

/**
 * Tarodan Design System — Shared Tailwind Preset (web adapter)
 *
 * The single source of truth for every design decision is this package's raw
 * tokens (colors, radius, spacing, typography, shadows, motion). This preset
 * is the *web adapter* that projects those tokens onto a Tailwind theme;
 * @tarodan/ui-native/lib/theme.ts is the equivalent native adapter.
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

const tarodanPreset: Partial<Config> = {
  theme: {
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
      borderRadius: toPx(radius),
      spacing: toRem(spacing),
      boxShadow: shadows,
      transitionTimingFunction: motion.easing,
      animation: motion.animation,
      keyframes: motion.keyframes,
    },
  },
};

export default tarodanPreset;
