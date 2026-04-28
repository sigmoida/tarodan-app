export const radius = {
  none: 0,
  sm: 2,
  DEFAULT: 4,
  md: 4,
  lg: 6,
  xl: 8,
  '2xl': 10,
  '3xl': 16,
  full: 9999,
} as const;

export type Radius = typeof radius;
