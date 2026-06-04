import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { theme } from './theme';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
}

export interface SegmentedButtonsProps<V extends string = string> {
  value: V;
  onValueChange: (value: V) => void;
  options: SegmentedOption<V>[];
  density?: 'small' | 'medium';
  style?: ViewStyle;
}

const { colors, radius, spacing, typography } = theme;

export function SegmentedButtons<V extends string = string>({
  value,
  onValueChange,
  options,
  density = 'medium',
  style,
}: SegmentedButtonsProps<V>) {
  const height = density === 'small' ? 36 : 44;
  const fontSize = density === 'small' ? typography.fontSize.sm : typography.fontSize.base;

  return (
    <View
      style={[
        styles.row,
        { height, borderRadius: radius.lg, borderColor: colors.border.DEFAULT },
        style,
      ]}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const isFirst = i === 0;
        const isLast = i === options.length - 1;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onValueChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? colors.primary[600]! : colors.surface.DEFAULT,
                opacity: pressed ? 0.85 : 1,
                borderTopLeftRadius: isFirst ? radius.lg - 1 : 0,
                borderBottomLeftRadius: isFirst ? radius.lg - 1 : 0,
                borderTopRightRadius: isLast ? radius.lg - 1 : 0,
                borderBottomRightRadius: isLast ? radius.lg - 1 : 0,
                borderRightWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                borderRightColor: colors.border.DEFAULT,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={{
                color: selected ? colors.white : colors.text.heading,
                fontSize,
                fontWeight: '600',
              }}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
});
