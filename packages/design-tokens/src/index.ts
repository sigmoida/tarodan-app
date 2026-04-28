export * from './colors';
export * from './radius';
export * from './shadows';
export * from './spacing';
export * from './typography';
export * from './motion';

import { colors } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';
import { motion } from './motion';

export const tokens = {
  colors,
  radius,
  shadows,
  spacing,
  typography,
  motion,
} as const;

export type Tokens = typeof tokens;
