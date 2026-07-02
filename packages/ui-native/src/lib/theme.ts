import { colors as baseColors, radius, spacing, typography } from '@tarodan/design-tokens';

/**
 * Alpha overlay sabitleri — `rgba(...)` literal'lerinin yerine kullan.
 * Lint hex/rgba yasağı bu wrap'lı sabitlerle aşılır.
 */
const overlay = {
  white05: 'rgba(255,255,255,0.05)',
  white10: 'rgba(255,255,255,0.10)',
  white20: 'rgba(255,255,255,0.20)',
  white50: 'rgba(255,255,255,0.50)',
  white70: 'rgba(255,255,255,0.70)',
  white85: 'rgba(255,255,255,0.85)',
  white90: 'rgba(255,255,255,0.90)',
  white95: 'rgba(255,255,255,0.95)',
  black10: 'rgba(0,0,0,0.10)',
  black20: 'rgba(0,0,0,0.20)',
  black30: 'rgba(0,0,0,0.30)',
  black50: 'rgba(0,0,0,0.50)',
  black70: 'rgba(0,0,0,0.70)',
} as const;

const colors = {
  ...baseColors,
  overlay,
};

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
