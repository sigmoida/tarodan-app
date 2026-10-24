export * from "./colors";
export * from "./radius";
export * from "./shadows";
export * from "./spacing";
export * from "./typography";
export * from "./motion";
export * from "./z-index";
export * from "./containers";
export * from "./breakpoints";

import { colors } from "./colors";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";
import { motion } from "./motion";
import { zIndex } from "./z-index";
import { containers } from "./containers";
import { breakpoints, contentWidths } from "./breakpoints";

export const tokens = {
  colors,
  radius,
  shadows,
  spacing,
  typography,
  motion,
  zIndex,
  containers,
  breakpoints,
  contentWidths,
} as const;

export type Tokens = typeof tokens;
