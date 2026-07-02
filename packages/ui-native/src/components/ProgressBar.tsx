import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

export interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  /** Indeterminate is not supported (use Spinner). */
  color?: string;
  trackColor?: string;
  height?: number;
  style?: ViewStyle;
}

const { colors, radius } = theme;

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  color,
  trackColor,
  height = 6,
  style,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={[
        {
          height,
          borderRadius: radius.full,
          backgroundColor: trackColor ?? colors.gray[200],
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          height: '100%',
          width: `${clamped * 100}%`,
          backgroundColor: color ?? colors.primary[600]!,
        }}
      />
    </View>
  );
};

const _styles = StyleSheet.create({});
