import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  /** Thickness in px. Default: hairlineWidth */
  thickness?: number;
  spacing?: number;
  style?: ViewStyle;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  color,
  thickness,
  spacing: gap,
  style,
}) => {
  const lineColor = color ?? theme.colors.border.subtle;
  const t = thickness ?? StyleSheet.hairlineWidth;
  const isV = orientation === 'vertical';

  return (
    <View
      style={[
        isV
          ? { width: t, alignSelf: 'stretch', backgroundColor: lineColor, marginHorizontal: gap }
          : { height: t, alignSelf: 'stretch', backgroundColor: lineColor, marginVertical: gap },
        style,
      ]}
    />
  );
};
