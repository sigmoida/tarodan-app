import { colors, radius, spacing, typography } from '@tarodan/design-tokens';

/**
 * Native theme — flattened tokens optimised for StyleSheet.
 */
export const theme = {
  colors,
  radius,
  spacing,
  typography,
} as const;

export type Theme = typeof theme;
