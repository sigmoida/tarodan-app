export * from "./colors";
export * from "./radius";
export * from "./shadows";
export * from "./spacing";
export * from "./typography";
export * from "./motion";
export * from "./z-index";

import { colors } from "./colors";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";
import { motion } from "./motion";
import { zIndex } from "./z-index";

export const tokens = {
  colors,
  radius,
  shadows,
  spacing,
  typography,
  motion,
  zIndex,
} as const;

export type Tokens = typeof tokens;
