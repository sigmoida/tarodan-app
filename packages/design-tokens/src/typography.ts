export const fontFamily = {
  sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
  display: ["Inter", "system-ui", "-apple-system", "sans-serif"],
} as const;

export const fontSize = {
  // Caption / badge micro-text. The smallest step below `xs`; use this instead
  // of arbitrary `text-[10px]`/`text-[11px]` values for dense labels/badges.
  "2xs": 10,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.7,
} as const;

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} as const;

export type Typography = typeof typography;
