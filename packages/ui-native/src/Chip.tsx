import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

export type ChipVariant = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info';
export type ChipSize = 'sm' | 'md';

export interface ChipProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ChipVariant;
  size?: ChipSize;
  selected?: boolean;
  /** Custom background color (overrides variant). Use sparingly — prefer variant. */
  backgroundColor?: string;
  textColor?: string;
  style?: ViewStyle;
}

const { colors, radius, spacing, typography } = theme;

const variantStyle: Record<ChipVariant, { bg: string; text: string }> = {
  neutral: { bg: colors.gray[100], text: colors.text.heading },
  primary: { bg: colors.primary[50]!, text: colors.primary[700]! },
  success: { bg: colors.success[50]!, text: colors.success[700]! },
  danger: { bg: colors.danger[50]!, text: colors.danger[700]! },
  warning: { bg: colors.warning[50]!, text: colors.warning[800]! },
  info: { bg: colors.info[50]!, text: colors.info[700]! },
};

const sizeMap: Record<ChipSize, { height: number; px: number; font: number }> = {
  sm: { height: 24, px: spacing[2], font: typography.fontSize.xs },
  md: { height: 32, px: spacing[3], font: typography.fontSize.sm },
};

export const Chip: React.FC<ChipProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  selected,
  backgroundColor,
  textColor,
  onPress,
  disabled,
  style,
  ...rest
}) => {
  const vs = variantStyle[variant];
  const ss = sizeMap[size];
  const bg =
    backgroundColor ?? (selected ? colors.primary[600]! : vs.bg);
  const fg = textColor ?? (selected ? colors.white : vs.text);

  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: ss.height,
          paddingHorizontal: ss.px,
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed && onPress ? 0.85 : 1,
        },
        style,
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      {...rest}
    >
      <Text
        style={{
          color: fg,
          fontSize: ss.font,
          fontWeight: '600',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
