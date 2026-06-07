import React from 'react';
import {
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

type SpacingKey = keyof typeof theme.spacing;

export interface StackProps extends ViewProps {
  /** spacing token key (0..24) or raw number in px */
  gap?: SpacingKey | number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  fullWidth?: boolean;
  flex?: number;
  padding?: SpacingKey | number;
  paddingX?: SpacingKey | number;
  paddingY?: SpacingKey | number;
}

const resolveSpacing = (v: SpacingKey | number | undefined): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  return theme.spacing[v];
};

const buildStack = (
  direction: 'column' | 'row',
  props: StackProps,
): { style: StyleProp<ViewStyle>; rest: ViewProps } => {
  const {
    gap,
    align,
    justify,
    wrap,
    fullWidth,
    flex,
    padding,
    paddingX,
    paddingY,
    style,
    ...viewProps
  } = props;
  const out: ViewStyle = { flexDirection: direction };
  const g = resolveSpacing(gap);
  if (g != null) out.gap = g;
  if (align) out.alignItems = align;
  if (justify) out.justifyContent = justify;
  if (wrap) out.flexWrap = 'wrap';
  if (fullWidth) out.alignSelf = 'stretch';
  if (flex != null) out.flex = flex;
  const p = resolveSpacing(padding);
  if (p != null) out.padding = p;
  const px = resolveSpacing(paddingX);
  if (px != null) out.paddingHorizontal = px;
  const py = resolveSpacing(paddingY);
  if (py != null) out.paddingVertical = py;
  const merged: StyleProp<ViewStyle> = [out, style];
  return { style: merged, rest: viewProps };
};

export const VStack: React.FC<StackProps> = (props) => {
  const { style, rest } = buildStack('column', props);
  return <View style={style} {...rest} />;
};

export const HStack: React.FC<StackProps> = (props) => {
  const { style, rest } = buildStack('row', props);
  return <View style={style} {...rest} />;
};

export const Stack = VStack;
