export const shadows = {
  soft: '0 2px 8px -2px rgba(0,0,0,0.08)',
  medium: '0 4px 16px -4px rgba(0,0,0,0.12)',
  elevated: '0 8px 30px -8px rgba(0,0,0,0.16)',
  premium: '0 12px 40px -12px rgba(0,0,0,0.2)',
  'inner-soft': 'inset 0 1px 3px 0 rgba(0,0,0,0.06)',
} as const;

export type Shadows = typeof shadows;
