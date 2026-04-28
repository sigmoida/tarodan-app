/**
 * Tarodan color tokens — single source of truth for every app.
 *
 * Naming rules:
 *   - Brand / action: `primary` (orange), `danger` (red), `success` (green), `info` (blue), `warning` (amber).
 *   - Text: `heading`, `body`, `muted`, `subtle` (decreasing emphasis).
 *   - Surface: `surface.DEFAULT` (page bg), `surface.alt` (card/section bg).
 *   - Neutral grays stay as tailwind-style `gray.50..900` for backwards-compatible utility usage.
 *
 * ESLint bans raw `bg-red-*`, `text-orange-*`, etc. — always go through a semantic token above.
 */

export type ColorScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
};

export type SemanticActionScale = Partial<ColorScale>;

export const primary: ColorScale = {
  50: '#fff7ed',
  100: '#ffedd5',
  200: '#fed7aa',
  300: '#fdba74',
  400: '#fb923c',
  500: '#f97316',
  600: '#ea580c',
  700: '#c2410c',
  800: '#9a3412',
  900: '#7c2d12',
};

export const danger: SemanticActionScale = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
  900: '#7f1d1d',
};

export const success: SemanticActionScale = {
  50: '#f0fdf4',
  100: '#dcfce7',
  200: '#bbf7d0',
  300: '#86efac',
  400: '#4ade80',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
  800: '#166534',
  900: '#14532d',
};

export const info: SemanticActionScale = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
};

export const warning: SemanticActionScale = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
};

export const gray: ColorScale = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e5e7eb',
  300: '#d1d5db',
  400: '#9ca3af',
  500: '#6b7280',
  600: '#4b5563',
  700: '#374151',
  800: '#1f2937',
  900: '#111827',
};

export const text = {
  heading: '#1A1A1A',
  body: '#333333',
  muted: '#666666',
  subtle: '#999999',
  inverted: '#FFFFFF',
} as const;

export const surface = {
  DEFAULT: '#FAFAFA',
  alt: '#F5F5F7',
  elevated: '#FFFFFF',
} as const;

export const border = {
  DEFAULT: '#E5E7EB',
  strong: '#D1D5DB',
  subtle: '#F3F4F6',
} as const;

/**
 * Flat map used by RN (StyleSheet can't consume nested Tailwind-style color palettes directly).
 */
export const colors = {
  primary,
  danger,
  success,
  info,
  warning,
  gray,
  text,
  surface,
  border,
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type Colors = typeof colors;
