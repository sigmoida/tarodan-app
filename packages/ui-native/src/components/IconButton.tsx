import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { theme } from '../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type IconButtonVariant = 'plain' | 'soft' | 'solid' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<PressableProps, 'style'> {
  icon: IoniconName;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Override icon color (otherwise derived from variant). */
  color?: string;
  style?: ViewStyle;
  /** Required for screen reader. */
  accessibilityLabel: string;
}

const { colors, radius } = theme;

const sizeMap: Record<IconButtonSize, { box: number; icon: number }> = {
  sm: { box: 32, icon: 18 },
  md: { box: 40, icon: 22 },
  lg: { box: 48, icon: 26 },
};

const variantStyle: Record<IconButtonVariant, { bg: string; fg: string }> = {
  plain: { bg: 'transparent', fg: colors.text.heading },
  soft: { bg: colors.primary[50]!, fg: colors.primary[700]! },
  solid: { bg: colors.primary[600]!, fg: colors.white },
  danger: { bg: colors.danger[50]!, fg: colors.danger[700]! },
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'plain',
  size = 'md',
  color,
  disabled,
  style,
  accessibilityLabel,
  ...rest
}) => {
  const ss = sizeMap[size];
  const vs = variantStyle[variant];
  return (
    <Pressable
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          width: ss.box,
          height: ss.box,
          backgroundColor: vs.bg,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...rest}
    >
      <Ionicons name={icon} size={ss.icon} color={color ?? vs.fg} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius['2xl'],
  },
});
