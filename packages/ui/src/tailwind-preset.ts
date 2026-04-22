import type { Config } from 'tailwindcss';
import {
  colors,
  shadows,
  motion,
  typography,
} from '@tarodan/design-tokens';

/**
 * Tarodan Design System — Shared Tailwind Preset
 *
 * All color/shadow/motion/typography tokens come from @tarodan/design-tokens
 * (the single source of truth shared with packages/ui-native).
 *
 * App-specific overrides (e.g. borderRadius scale) are layered in each
 * app's tailwind.config.ts.
 */
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
        'border-strong': colors.border.strong,
        'border-subtle': colors.border.subtle,
      },
      backgroundColor: {
        'surface': colors.surface.DEFAULT,
        'surface-alt': colors.surface.alt,
        'surface-elevated': colors.surface.elevated,
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
        display: [...typography.fontFamily.display],
      },
      boxShadow: shadows,
      transitionTimingFunction: motion.easing,
      animation: motion.animation,
      keyframes: motion.keyframes,
    },
  },
};

export default tarodanPreset;
